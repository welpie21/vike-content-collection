import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { getLastModified } from "../src/plugin/git";

describe("getLastModified", () => {
	it("returns a Date for a tracked file", () => {
		const filePath = join(import.meta.dir, "..", "package.json");
		const result = getLastModified(filePath);

		expect(result).toBeInstanceOf(Date);
		expect(result?.getTime()).not.toBeNaN();
	});

	it("returns undefined for a non-existent file", () => {
		const result = getLastModified("/nonexistent/file.md");

		expect(result).toBeUndefined();
	});

	it("returns undefined for an untracked file", () => {
		const tmpFile = join(
			import.meta.dir,
			"..",
			"node_modules",
			".cache",
			"untracked-test-file.tmp",
		);
		const result = getLastModified(tmpFile);

		expect(result).toBeUndefined();
	});
});
