import { execFile } from "node:child_process";
import { relative } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Retrieve the last commit dates for multiple files in a single git
 * invocation.  Falls back to per-file queries when the batch command
 * fails (e.g. too many arguments).
 */
export async function getLastModifiedBatch(
	filePaths: string[],
	cwd: string,
): Promise<Map<string, Date | undefined>> {
	const result = new Map<string, Date | undefined>();
	if (filePaths.length === 0) return result;

	const relativePaths = filePaths.map((fp) => relative(cwd, fp));

	try {
		const { stdout } = await execFileAsync(
			"git",
			[
				"log",
				"--format=%cI",
				"--name-only",
				"--diff-filter=ACMR",
				"--",
				...relativePaths,
			],
			{ cwd, maxBuffer: 10 * 1024 * 1024 },
		);

		const dateMap = parseBatchGitLog(stdout, cwd);
		for (const fp of filePaths) {
			const rel = relative(cwd, fp);
			result.set(fp, dateMap.get(rel));
		}
	} catch {
		const perFile = await Promise.all(
			filePaths.map(async (fp) => {
				const date = await getLastModified(fp, cwd);
				return [fp, date] as const;
			}),
		);
		for (const [fp, date] of perFile) {
			result.set(fp, date);
		}
	}

	return result;
}

function parseBatchGitLog(
	output: string,
	_cwd: string,
): Map<string, Date | undefined> {
	const result = new Map<string, Date | undefined>();
	const lines = output.split("\n");

	let currentDate: Date | undefined;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
			const date = new Date(trimmed);
			currentDate = Number.isNaN(date.getTime()) ? undefined : date;
		} else if (currentDate && !result.has(trimmed)) {
			result.set(trimmed, currentDate);
		}
	}

	return result;
}

/**
 * Retrieve the last commit date for a single file using git log (async).
 * Used as fallback when batch query fails.
 */
export async function getLastModified(
	filePath: string,
	cwd: string,
): Promise<Date | undefined> {
	try {
		const rel = relative(cwd, filePath);
		const { stdout } = await execFileAsync(
			"git",
			["log", "-1", "--format=%cI", "--", rel],
			{ cwd },
		);

		const output = stdout.trim();
		if (!output) return undefined;
		const date = new Date(output);
		return Number.isNaN(date.getTime()) ? undefined : date;
	} catch {
		return undefined;
	}
}
