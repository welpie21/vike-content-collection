import { describe, expect, it } from "bun:test";
import {
	getReferenceTarget,
	isReference,
	reference,
} from "../src/runtime/reference";

describe("reference", () => {
	it("creates a schema that accepts strings", () => {
		const schema = reference("authors");
		const result = schema.safeParse("john-doe");

		expect(result.success).toBe(true);
	});

	it("rejects non-string values", () => {
		const schema = reference("authors");
		const result = schema.safeParse(42);

		expect(result.success).toBe(false);
	});

	it("stores the target collection name", () => {
		const schema = reference("authors");

		expect(getReferenceTarget(schema)).toBe("authors");
	});
});

describe("isReference", () => {
	it("returns true for reference schemas", () => {
		const schema = reference("authors");

		expect(isReference(schema)).toBe(true);
	});

	it("returns false for null/undefined", () => {
		expect(isReference(null)).toBe(false);
		expect(isReference(undefined)).toBe(false);
	});

	it("returns false for plain objects", () => {
		expect(isReference({ _collectionRef: "test" })).toBe(false);
	});
});

describe("getReferenceTarget", () => {
	it("returns collection name for reference schemas", () => {
		const schema = reference("posts");

		expect(getReferenceTarget(schema)).toBe("posts");
	});

	it("returns null for non-reference values", () => {
		expect(getReferenceTarget("string")).toBeNull();
		expect(getReferenceTarget(42)).toBeNull();
		expect(getReferenceTarget(null)).toBeNull();
	});
});
