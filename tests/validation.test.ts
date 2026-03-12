import { describe, expect, it } from "bun:test";
import { z } from "zod";
import type { MetadataLineMap } from "../src/plugin/markdown";
import { validateMetadata } from "../src/plugin/validation";

const simpleSchema = z.object({
	title: z.string(),
	draft: z.boolean().optional(),
});

const nestedSchema = z.object({
	title: z.string(),
	metadata: z.object({
		name: z.string(),
		date: z.string(),
	}),
});

describe("validateMetadata", () => {
	it("returns validated data for valid metadata", () => {
		const metadata = { title: "Hello", draft: false };
		const lineMap: MetadataLineMap = { title: 2, draft: 3 };

		const result = validateMetadata(
			metadata,
			simpleSchema,
			"/test/post.md",
			lineMap,
		);

		expect(result).toEqual({ title: "Hello", draft: false });
	});

	it("returns validated data with optional fields omitted", () => {
		const metadata = { title: "Hello" };
		const lineMap: MetadataLineMap = { title: 2 };

		const result = validateMetadata(
			metadata,
			simpleSchema,
			"/test/post.md",
			lineMap,
		);

		expect(result).toEqual({ title: "Hello" });
	});

	it("returns validated data for nested schema", () => {
		const metadata = {
			title: "Post",
			metadata: { name: "Jane", date: "2025-01-01" },
		};
		const lineMap: MetadataLineMap = {
			title: 2,
			metadata: 3,
			"metadata.name": 4,
			"metadata.date": 5,
		};

		const result = validateMetadata(
			metadata,
			nestedSchema,
			"/test/post.md",
			lineMap,
		);

		expect(result).toEqual(metadata);
	});

	it("throws on missing required field", () => {
		const metadata = {};
		const lineMap: MetadataLineMap = {};

		expect(() =>
			validateMetadata(metadata, simpleSchema, "/test/post.md", lineMap),
		).toThrow(/Schema validation failed/);
	});

	it("throws on wrong type", () => {
		const metadata = { title: 123 };
		const lineMap: MetadataLineMap = { title: 2 };

		expect(() =>
			validateMetadata(metadata, simpleSchema, "/test/post.md", lineMap),
		).toThrow(/Schema validation failed/);
	});

	it("includes file path in error message", () => {
		const metadata = { title: 123 };
		const lineMap: MetadataLineMap = { title: 2 };

		try {
			validateMetadata(
				metadata,
				simpleSchema,
				"/pages/blog/broken.md",
				lineMap,
			);
		} catch (err) {
			expect((err as Error).message).toContain("/pages/blog/broken.md");
		}
	});

	it("includes line number in error for known key paths", () => {
		const metadata = { title: 123 };
		const lineMap: MetadataLineMap = { title: 2 };

		try {
			validateMetadata(metadata, simpleSchema, "/test/post.md", lineMap);
		} catch (err) {
			expect((err as Error).message).toContain(":2");
			expect((err as Error).message).toContain('"title"');
		}
	});

	it("maps nested error paths to line numbers", () => {
		const metadata = {
			title: "OK",
			metadata: { name: 42, date: "2025-01-01" },
		};
		const lineMap: MetadataLineMap = {
			title: 2,
			metadata: 3,
			"metadata.name": 4,
			"metadata.date": 5,
		};

		try {
			validateMetadata(metadata, nestedSchema, "/test/post.md", lineMap);
		} catch (err) {
			const msg = (err as Error).message;
			expect(msg).toContain(":4");
			expect(msg).toContain('"metadata.name"');
		}
	});

	it("falls back to parent path for unmapped nested keys", () => {
		const schema = z.object({
			config: z.object({
				deep: z.object({
					value: z.string(),
				}),
			}),
		});
		const metadata = { config: { deep: { value: 123 } } };
		const lineMap: MetadataLineMap = { config: 2 };

		try {
			validateMetadata(metadata, schema, "/test/post.md", lineMap);
		} catch (err) {
			const msg = (err as Error).message;
			expect(msg).toContain(":2");
		}
	});

	it("reports multiple validation errors at once", () => {
		const metadata = { title: 123, metadata: { name: 456, date: 789 } };
		const lineMap: MetadataLineMap = {
			title: 2,
			metadata: 3,
			"metadata.name": 4,
			"metadata.date": 5,
		};

		try {
			validateMetadata(metadata, nestedSchema, "/test/post.md", lineMap);
		} catch (err) {
			const msg = (err as Error).message;
			expect(msg).toContain('"title"');
			expect(msg).toContain('"metadata.name"');
			expect(msg).toContain('"metadata.date"');
		}
	});

	it("sets error name to ContentCollectionValidationError", () => {
		const metadata = { title: 123 };
		const lineMap: MetadataLineMap = { title: 2 };

		try {
			validateMetadata(metadata, simpleSchema, "/test/post.md", lineMap);
		} catch (err) {
			expect((err as Error).name).toBe("ContentCollectionValidationError");
		}
	});
});
