import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { getLastModified, getLastModifiedBatch } from "../src/plugin/git";

const projectRoot = join(import.meta.dir, "..");

describe("getLastModified", () => {
	it("returns a Date for a tracked file", async () => {
		const filePath = join(projectRoot, "package.json");
		const result = await getLastModified(filePath, projectRoot);

		expect(result).toBeInstanceOf(Date);
		expect(result?.getTime()).not.toBeNaN();
	});

	it("returns undefined for a non-existent file", async () => {
		const result = await getLastModified("/nonexistent/file.md", projectRoot);

		expect(result).toBeUndefined();
	});

	it("returns undefined for an untracked file", async () => {
		const tmpFile = join(
			projectRoot,
			"node_modules",
			".cache",
			"untracked-test-file.tmp",
		);
		const result = await getLastModified(tmpFile, projectRoot);

		expect(result).toBeUndefined();
	});
});

describe("getLastModifiedBatch", () => {
	it("returns dates for multiple tracked files", async () => {
		const files = [
			join(projectRoot, "package.json"),
			join(projectRoot, "tsconfig.json"),
		];
		const result = await getLastModifiedBatch(files, projectRoot);

		expect(result.size).toBe(2);
		for (const fp of files) {
			const date = result.get(fp);
			expect(date).toBeInstanceOf(Date);
			expect(date?.getTime()).not.toBeNaN();
		}
	});

	it("returns an empty map for no files", async () => {
		const result = await getLastModifiedBatch([], projectRoot);

		expect(result.size).toBe(0);
	});

	it("returns undefined for untracked files in batch", async () => {
		const trackedFile = join(projectRoot, "package.json");
		const untrackedFile = join(
			projectRoot,
			"node_modules",
			".cache",
			"untracked.tmp",
		);
		const result = await getLastModifiedBatch(
			[trackedFile, untrackedFile],
			projectRoot,
		);

		expect(result.get(trackedFile)).toBeInstanceOf(Date);
		expect(result.get(untrackedFile)).toBeUndefined();
	});
});
