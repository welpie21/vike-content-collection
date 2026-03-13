import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASELINE_PATH = join(import.meta.dirname, "baseline.json");

const c = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
	bgRed: "\x1b[41m",
	bgGreen: "\x1b[42m",
};

export interface BenchmarkResult {
	name: string;
	mean: number;
	median: number;
	p95: number;
	p99: number;
	min: number;
	max: number;
	stddev: number;
	opsPerSec: number;
	samples: number;
}

interface Baseline {
	timestamp: string;
	results: Record<string, Record<string, BenchmarkResult>>;
}

interface BenchmarkCase {
	name: string;
	fn: () => void | Promise<void>;
}

export interface Suite {
	name: string;
	cases: BenchmarkCase[];
	add(name: string, fn: () => void | Promise<void>): void;
}

export interface RunOptions {
	save?: boolean;
	threshold?: number;
	warmupMs?: number;
	measureMs?: number;
	minSamples?: number;
}

export function suite(name: string): Suite {
	const cases: BenchmarkCase[] = [];
	return {
		name,
		cases,
		add(caseName: string, fn: () => void | Promise<void>) {
			cases.push({ name: caseName, fn });
		},
	};
}

function computeStats(samples: number[], name: string): BenchmarkResult {
	const sorted = [...samples].sort((a, b) => a - b);
	const n = sorted.length;
	const sum = sorted.reduce((a, b) => a + b, 0);
	const mean = sum / n;
	const median =
		n % 2 === 0
			? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
			: sorted[Math.floor(n / 2)];
	const p95 = sorted[Math.floor(n * 0.95)];
	const p99 = sorted[Math.floor(n * 0.99)];
	const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
	const stddev = Math.sqrt(variance);
	const opsPerSec = 1_000_000 / mean;

	return {
		name,
		mean,
		median,
		p95,
		p99,
		min: sorted[0],
		max: sorted[n - 1],
		stddev,
		opsPerSec,
		samples: n,
	};
}

async function collectSamples(
	fn: () => void | Promise<void>,
	opts: Required<Pick<RunOptions, "warmupMs" | "measureMs" | "minSamples">>,
): Promise<number[]> {
	const isAsync = fn.constructor.name === "AsyncFunction";

	if (isAsync) {
		const warmupEnd = performance.now() + opts.warmupMs;
		while (performance.now() < warmupEnd) await fn();

		const samples: number[] = [];
		const measureEnd = performance.now() + opts.measureMs;
		while (performance.now() < measureEnd || samples.length < opts.minSamples) {
			const start = performance.now();
			await fn();
			samples.push((performance.now() - start) * 1_000);
		}
		return samples;
	}

	const syncFn = fn as () => void;

	// Calibrate: find batch size so one batch takes ~1ms
	let batchSize = 1;
	while (true) {
		const start = performance.now();
		for (let i = 0; i < batchSize; i++) syncFn();
		const elapsed = (performance.now() - start) * 1_000;
		if (elapsed >= 1_000) break; // >= 1ms
		batchSize =
			elapsed < 100 ? batchSize * 10 : Math.ceil(batchSize * (1_000 / elapsed));
	}

	// Warmup
	const warmupEnd = performance.now() + opts.warmupMs;
	while (performance.now() < warmupEnd) {
		for (let i = 0; i < batchSize; i++) syncFn();
	}

	// Measure: each sample is the average of one batch
	const samples: number[] = [];
	const measureEnd = performance.now() + opts.measureMs;
	while (performance.now() < measureEnd || samples.length < opts.minSamples) {
		const start = performance.now();
		for (let i = 0; i < batchSize; i++) syncFn();
		samples.push(((performance.now() - start) * 1_000) / batchSize);
	}

	return samples;
}

function formatTime(us: number): string {
	if (us >= 1_000_000) return `${(us / 1_000_000).toFixed(2)} s`;
	if (us >= 1_000) return `${(us / 1_000).toFixed(2)} ms`;
	if (us >= 1) return `${us.toFixed(2)} µs`;
	return `${(us * 1_000).toFixed(2)} ns`;
}

function formatOps(ops: number): string {
	if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M`;
	if (ops >= 1_000) return `${(ops / 1_000).toFixed(2)}K`;
	return ops.toFixed(0);
}

function loadBaseline(): Baseline | null {
	if (!existsSync(BASELINE_PATH)) return null;
	try {
		return JSON.parse(readFileSync(BASELINE_PATH, "utf-8")) as Baseline;
	} catch {
		return null;
	}
}

function saveBaseline(baseline: Baseline): void {
	writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, "\t")}\n`);
}

function printResult(
	result: BenchmarkResult,
	baselineResult: BenchmarkResult | undefined,
	threshold: number,
): "regression" | "improvement" | "unchanged" {
	const { name, mean, median, p95, stddev, opsPerSec, samples, min, max } =
		result;

	process.stdout.write("\x1b[2K");
	console.log(`  ${c.bold}${name}${c.reset}`);
	console.log(
		`    ${c.cyan}${formatTime(mean)}${c.reset}/op  ` +
			`±${formatTime(stddev)}  ` +
			`${c.dim}(${formatOps(opsPerSec)} ops/sec, ${samples} samples)${c.reset}`,
	);
	console.log(
		`    ${c.dim}median: ${formatTime(median)}  ` +
			`p95: ${formatTime(p95)}  ` +
			`min: ${formatTime(min)}  ` +
			`max: ${formatTime(max)}${c.reset}`,
	);

	let status: "regression" | "improvement" | "unchanged" = "unchanged";

	if (baselineResult) {
		const diff = ((mean - baselineResult.mean) / baselineResult.mean) * 100;

		if (diff > threshold) {
			status = "regression";
			console.log(
				`    ${c.bgRed}${c.white}${c.bold} +${diff.toFixed(1)}% SLOWER ${c.reset} ` +
					`${c.dim}(was ${formatTime(baselineResult.mean)}/op)${c.reset}`,
			);
		} else if (diff < -threshold) {
			status = "improvement";
			console.log(
				`    ${c.bgGreen}${c.white}${c.bold} ${diff.toFixed(1)}% FASTER ${c.reset} ` +
					`${c.dim}(was ${formatTime(baselineResult.mean)}/op)${c.reset}`,
			);
		} else {
			console.log(
				`    ${c.green}≈ ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%${c.reset} ` +
					`${c.dim}(within ±${threshold}% threshold)${c.reset}`,
			);
		}
	} else {
		console.log(`    ${c.yellow}no baseline${c.reset}`);
	}

	console.log();
	return status;
}

export async function run(
	suites: Suite[],
	options: RunOptions = {},
): Promise<void> {
	const {
		save = false,
		threshold = 10,
		warmupMs = 500,
		measureMs = 3_000,
		minSamples = 50,
	} = options;

	const baseline = loadBaseline();
	const allResults: Record<string, Record<string, BenchmarkResult>> = {};

	let totalBenchmarks = 0;
	let regressions = 0;
	let improvements = 0;

	const totalCases = suites.reduce((sum, s) => sum + s.cases.length, 0);

	console.log();
	console.log(`${c.bold}${c.cyan}  Benchmark Suite${c.reset}`);
	console.log(
		`${c.dim}  ${totalCases} benchmarks across ${suites.length} suites${c.reset}`,
	);
	console.log(
		`${c.dim}  threshold: ±${threshold}%  warmup: ${warmupMs}ms  measure: ${measureMs}ms${c.reset}`,
	);
	if (baseline) {
		console.log(
			`${c.dim}  comparing against baseline from ${baseline.timestamp}${c.reset}`,
		);
	}
	console.log();

	for (const s of suites) {
		if (s.cases.length === 0) continue;

		console.log(
			`${c.bold}${c.blue}─── ${s.name} ${"─".repeat(Math.max(0, 55 - s.name.length))}${c.reset}`,
		);
		console.log();

		allResults[s.name] = {};

		for (const benchCase of s.cases) {
			totalBenchmarks++;
			process.stdout.write(
				`  ${c.dim}Running ${benchCase.name}...${c.reset}\r`,
			);

			const samples = await collectSamples(benchCase.fn, {
				warmupMs,
				measureMs,
				minSamples,
			});

			const result = computeStats(samples, benchCase.name);
			allResults[s.name][benchCase.name] = result;

			const baselineResult = baseline?.results[s.name]?.[benchCase.name];
			const status = printResult(result, baselineResult, threshold);

			if (status === "regression") regressions++;
			if (status === "improvement") improvements++;
		}
	}

	// Summary
	console.log(`${c.bold}${c.blue}${"─".repeat(60)}${c.reset}`);
	console.log();

	const parts = [`${c.bold}${totalBenchmarks}${c.reset} benchmarks`];

	if (regressions > 0) {
		parts.push(
			`${c.red}${c.bold}${regressions} regression${regressions > 1 ? "s" : ""}${c.reset}`,
		);
	}
	if (improvements > 0) {
		parts.push(
			`${c.green}${c.bold}${improvements} improvement${improvements > 1 ? "s" : ""}${c.reset}`,
		);
	}
	const unchanged = totalBenchmarks - regressions - improvements;
	if (baseline && unchanged > 0) {
		parts.push(`${c.dim}${unchanged} unchanged${c.reset}`);
	}

	console.log(`  ${parts.join("  ·  ")}`);

	if (save) {
		const newBaseline: Baseline = {
			timestamp: new Date().toISOString(),
			results: allResults,
		};
		saveBaseline(newBaseline);
		console.log();
		console.log(
			`  ${c.green}${c.bold}Baseline saved${c.reset} ${c.dim}→ benchmarks/baseline.json${c.reset}`,
		);
	}

	console.log();

	if (regressions > 0 && !save) {
		process.exit(1);
	}
}

export function parseCliOptions(): RunOptions {
	const args = process.argv.slice(2);
	const options: RunOptions = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--save") {
			options.save = true;
		} else if (arg === "--threshold" && args[i + 1]) {
			options.threshold = Number(args[++i]);
		} else if (arg === "--warmup" && args[i + 1]) {
			options.warmupMs = Number(args[++i]);
		} else if (arg === "--measure" && args[i + 1]) {
			options.measureMs = Number(args[++i]);
		} else if (arg === "--min-samples" && args[i + 1]) {
			options.minSamples = Number(args[++i]);
		} else if (arg === "--help" || arg === "-h") {
			console.log(`
Usage: bun run bench [options]

Options:
  --save              Save results as the new baseline
  --threshold <n>     Regression threshold percentage (default: 10)
  --warmup <ms>       Warmup duration per benchmark (default: 500)
  --measure <ms>      Measurement duration per benchmark (default: 3000)
  --min-samples <n>   Minimum samples per benchmark (default: 50)
  -h, --help          Show this help message
`);
			process.exit(0);
		}
	}

	return options;
}
