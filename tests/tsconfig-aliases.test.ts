import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadTsconfigAliases, stripJsonc } from "../src/plugin/vite-plugin";

describe("stripJsonc", () => {
	it("strips line comments", () => {
		const input = `{
	// this is a comment
	"key": "value"
}`;
		const result = JSON.parse(stripJsonc(input));
		expect(result).toEqual({ key: "value" });
	});

	it("strips block comments", () => {
		const input = `{
	/* block comment */
	"key": "value"
}`;
		const result = JSON.parse(stripJsonc(input));
		expect(result).toEqual({ key: "value" });
	});

	it("strips trailing commas", () => {
		const input = `{
	"a": 1,
	"b": 2,
}`;
		const result = JSON.parse(stripJsonc(input));
		expect(result).toEqual({ a: 1, b: 2 });
	});

	it("does not strip slashes inside strings", () => {
		const input = `{
	"url": "https://example.com"
}`;
		const result = JSON.parse(stripJsonc(input));
		expect(result).toEqual({ url: "https://example.com" });
	});

	it("handles mixed comments and trailing commas", () => {
		const input = `{
	// line comment
	"a": 1, /* inline block */
	"b": [1, 2,],
}`;
		const result = JSON.parse(stripJsonc(input));
		expect(result).toEqual({ a: 1, b: [1, 2] });
	});
});

describe("loadTsconfigAliases", () => {
	const tmpDir = join(import.meta.dir, ".tmp-tsconfig-test");

	beforeAll(() => {
		mkdirSync(tmpDir, { recursive: true });
	});

	afterAll(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	function createProject(name: string, files: Record<string, string>): string {
		const dir = join(tmpDir, name);
		mkdirSync(dir, { recursive: true });
		for (const [path, content] of Object.entries(files)) {
			const fullPath = join(dir, path);
			mkdirSync(join(fullPath, ".."), { recursive: true });
			writeFileSync(fullPath, content);
		}
		return dir;
	}

	it("loads paths from a simple tsconfig.json", () => {
		const dir = createProject("simple", {
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					baseUrl: ".",
					paths: {
						"~/*": ["./src/*"],
					},
				},
			}),
		});

		const aliases = loadTsconfigAliases(dir);
		expect(aliases["~"]).toBe(resolve(dir, "src"));
	});

	it("handles baseUrl resolution", () => {
		const dir = createProject("baseurl", {
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					baseUrl: "./src",
					paths: {
						"@lib/*": ["./lib/*"],
					},
				},
			}),
		});

		const aliases = loadTsconfigAliases(dir);
		expect(aliases["@lib"]).toBe(resolve(dir, "src", "lib"));
	});

	it("handles multiple path entries", () => {
		const dir = createProject("multi", {
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					baseUrl: ".",
					paths: {
						"~/*": ["./src/*"],
						"@components/*": ["./src/components/*"],
						"@utils/*": ["./src/utils/*"],
					},
				},
			}),
		});

		const aliases = loadTsconfigAliases(dir);
		expect(aliases["~"]).toBe(resolve(dir, "src"));
		expect(aliases["@components"]).toBe(resolve(dir, "src/components"));
		expect(aliases["@utils"]).toBe(resolve(dir, "src/utils"));
	});

	it("returns empty object when tsconfig.json is missing", () => {
		const dir = createProject("missing", {});
		const aliases = loadTsconfigAliases(dir);
		expect(aliases).toEqual({});
	});

	it("returns empty object when no paths are defined", () => {
		const dir = createProject("no-paths", {
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					strict: true,
				},
			}),
		});

		const aliases = loadTsconfigAliases(dir);
		expect(aliases).toEqual({});
	});

	it("handles tsconfig with JSONC comments", () => {
		const dir = createProject("jsonc", {
			"tsconfig.json": `{
	// TypeScript config
	"compilerOptions": {
		"baseUrl": ".",
		/* Path aliases */
		"paths": {
			"~/*": ["./src/*"],
		},
	},
}`,
		});

		const aliases = loadTsconfigAliases(dir);
		expect(aliases["~"]).toBe(resolve(dir, "src"));
	});

	it("follows extends from a relative parent config", () => {
		const dir = createProject("extends", {
			"base.json": JSON.stringify({
				compilerOptions: {
					baseUrl: ".",
					paths: {
						"~/*": ["./src/*"],
						"@shared/*": ["./shared/*"],
					},
				},
			}),
			"tsconfig.json": JSON.stringify({
				extends: "./base.json",
				compilerOptions: {
					paths: {
						"@app/*": ["./app/*"],
					},
				},
			}),
		});

		const aliases = loadTsconfigAliases(dir);
		expect(aliases["~"]).toBe(resolve(dir, "src"));
		expect(aliases["@shared"]).toBe(resolve(dir, "shared"));
		expect(aliases["@app"]).toBe(resolve(dir, "app"));
	});

	it("handles exact-match aliases without wildcards", () => {
		const dir = createProject("exact", {
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					baseUrl: ".",
					paths: {
						config: ["./src/config.ts"],
					},
				},
			}),
		});

		const aliases = loadTsconfigAliases(dir);
		expect(aliases.config).toBe(resolve(dir, "src/config.ts"));
	});
});
