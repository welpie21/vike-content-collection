import { describe, expect, it } from "bun:test";
import {
	ContentCollectionError,
	formatValidationErrors,
	throwValidationError,
	type ValidationIssue,
} from "../src/plugin/errors";

describe("ContentCollectionError", () => {
	it("formats message with file path only", () => {
		const err = new ContentCollectionError("bad metadata", "/pages/post.md");

		expect(err.message).toBe(
			"[vike-content-collection] /pages/post.md - bad metadata",
		);
		expect(err.name).toBe("ContentCollectionError");
		expect(err.filePath).toBe("/pages/post.md");
		expect(err.line).toBeUndefined();
		expect(err.column).toBeUndefined();
	});

	it("formats message with file path and line", () => {
		const err = new ContentCollectionError("wrong type", "/pages/post.md", 5);

		expect(err.message).toBe(
			"[vike-content-collection] /pages/post.md:5 - wrong type",
		);
		expect(err.line).toBe(5);
		expect(err.column).toBeUndefined();
	});

	it("formats message with file path, line, and column", () => {
		const err = new ContentCollectionError(
			"missing key",
			"/pages/post.md",
			3,
			10,
		);

		expect(err.message).toBe(
			"[vike-content-collection] /pages/post.md:3:10 - missing key",
		);
		expect(err.line).toBe(3);
		expect(err.column).toBe(10);
	});

	it("is an instance of Error", () => {
		const err = new ContentCollectionError("test", "/file.md");
		expect(err).toBeInstanceOf(Error);
	});
});

describe("formatValidationErrors", () => {
	it("formats a single issue with line and path", () => {
		const issues: ValidationIssue[] = [
			{
				message: "Expected string, received number",
				path: ["title"],
				filePath: "/pages/blog/post.md",
				line: 2,
			},
		];

		const result = formatValidationErrors(issues);

		expect(result).toContain(
			"[vike-content-collection] Schema validation failed:",
		);
		expect(result).toContain(
			'/pages/blog/post.md:2 (at "title"): Expected string, received number',
		);
	});

	it("formats multiple issues", () => {
		const issues: ValidationIssue[] = [
			{
				message: "Required",
				path: ["title"],
				filePath: "/pages/post.md",
				line: 2,
			},
			{
				message: "Invalid date",
				path: ["metadata", "date"],
				filePath: "/pages/post.md",
				line: 5,
			},
		];

		const result = formatValidationErrors(issues);
		const lines = result.split("\n");

		expect(lines).toHaveLength(3);
		expect(lines[1]).toContain('"title"');
		expect(lines[2]).toContain('"metadata.date"');
	});

	it("formats an issue without line info", () => {
		const issues: ValidationIssue[] = [
			{
				message: "Required",
				path: ["unknown_field"],
				filePath: "/pages/post.md",
			},
		];

		const result = formatValidationErrors(issues);

		expect(result).toContain('/pages/post.md (at "unknown_field"): Required');
		expect(result).not.toContain(":undefined");
	});

	it("formats an issue with no path", () => {
		const issues: ValidationIssue[] = [
			{
				message: "Invalid input",
				path: [],
				filePath: "/pages/post.md",
				line: 1,
			},
		];

		const result = formatValidationErrors(issues);

		expect(result).toContain("/pages/post.md:1: Invalid input");
		expect(result).not.toContain("(at");
	});

	it("formats an issue with line and column", () => {
		const issues: ValidationIssue[] = [
			{
				message: "Bad value",
				path: ["title"],
				filePath: "/pages/post.md",
				line: 2,
				column: 8,
			},
		];

		const result = formatValidationErrors(issues);

		expect(result).toContain('/pages/post.md:2:8 (at "title"): Bad value');
	});
});

describe("throwValidationError", () => {
	it("throws an error with name ContentCollectionValidationError", () => {
		const issues: ValidationIssue[] = [
			{
				message: "Required",
				path: ["title"],
				filePath: "/pages/post.md",
				line: 2,
			},
		];

		expect(() => throwValidationError(issues)).toThrow();

		try {
			throwValidationError(issues);
		} catch (err) {
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).name).toBe("ContentCollectionValidationError");
			expect((err as Error).message).toContain("Schema validation failed");
		}
	});
});
