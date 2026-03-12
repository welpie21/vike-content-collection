import { describe, expect, it } from "bun:test";
import { paginate, sortCollection } from "../src/runtime/helpers";
import type { TypedCollectionEntry } from "../src/types/index";

interface TestMetadata {
	title: string;
	date: Date;
	order: number;
}

function makeEntries(count: number): TypedCollectionEntry<TestMetadata>[] {
	const index: Record<string, TypedCollectionEntry<TestMetadata>> = {};
	return Array.from({ length: count }, (_, i) => {
		const entry: TypedCollectionEntry<TestMetadata> = {
			filePath: `/pages/blog/post-${i}.md`,
			slug: `post-${i}`,
			metadata: {
				title: `Post ${String.fromCharCode(90 - i)}`,
				date: new Date(`2025-0${(i % 9) + 1}-15`),
				order: count - i,
			},
			content: `Body ${i}`,
			computed: {},
			lastModified: undefined,
			_isDraft: false,
			index,
		};
		index[entry.slug] = entry;
		return entry;
	});
}

describe("sortCollection", () => {
	it("sorts by string field ascending", () => {
		const entries = makeEntries(3);
		const sorted = sortCollection(entries, "title", "asc");

		expect(sorted[0].metadata.title).toBe("Post X");
		expect(sorted[1].metadata.title).toBe("Post Y");
		expect(sorted[2].metadata.title).toBe("Post Z");
	});

	it("sorts by string field descending", () => {
		const entries = makeEntries(3);
		const sorted = sortCollection(entries, "title", "desc");

		expect(sorted[0].metadata.title).toBe("Post Z");
		expect(sorted[2].metadata.title).toBe("Post X");
	});

	it("sorts by number field ascending", () => {
		const entries = makeEntries(3);
		const sorted = sortCollection(entries, "order", "asc");

		expect(sorted[0].metadata.order).toBe(1);
		expect(sorted[2].metadata.order).toBe(3);
	});

	it("sorts by number field descending", () => {
		const entries = makeEntries(3);
		const sorted = sortCollection(entries, "order", "desc");

		expect(sorted[0].metadata.order).toBe(3);
		expect(sorted[2].metadata.order).toBe(1);
	});

	it("sorts by date field", () => {
		const entries = makeEntries(3);
		const sorted = sortCollection(entries, "date", "asc");

		expect(sorted[0].metadata.date.getMonth()).toBe(0);
		expect(sorted[2].metadata.date.getMonth()).toBe(2);
	});

	it("defaults to ascending order", () => {
		const entries = makeEntries(3);
		const sorted = sortCollection(entries, "order");

		expect(sorted[0].metadata.order).toBe(1);
	});

	it("does not mutate the original array", () => {
		const entries = makeEntries(3);
		const firstSlug = entries[0].slug;
		sortCollection(entries, "title", "asc");

		expect(entries[0].slug).toBe(firstSlug);
	});

	it("handles empty array", () => {
		const sorted = sortCollection<TestMetadata>([], "title");
		expect(sorted).toEqual([]);
	});
});

describe("paginate", () => {
	it("returns correct page of items", () => {
		const entries = makeEntries(10);
		const result = paginate(entries, { pageSize: 3, currentPage: 2 });

		expect(result.items).toHaveLength(3);
		expect(result.items[0].slug).toBe("post-3");
		expect(result.currentPage).toBe(2);
	});

	it("calculates total pages correctly", () => {
		const entries = makeEntries(10);
		const result = paginate(entries, { pageSize: 3, currentPage: 1 });

		expect(result.totalPages).toBe(4);
		expect(result.totalItems).toBe(10);
	});

	it("handles last partial page", () => {
		const entries = makeEntries(10);
		const result = paginate(entries, { pageSize: 3, currentPage: 4 });

		expect(result.items).toHaveLength(1);
		expect(result.hasNextPage).toBe(false);
		expect(result.hasPreviousPage).toBe(true);
	});

	it("clamps page to valid range", () => {
		const entries = makeEntries(5);
		const result = paginate(entries, { pageSize: 2, currentPage: 100 });

		expect(result.currentPage).toBe(3);
		expect(result.items).toHaveLength(1);
	});

	it("clamps negative page to 1", () => {
		const entries = makeEntries(5);
		const result = paginate(entries, { pageSize: 2, currentPage: -1 });

		expect(result.currentPage).toBe(1);
		expect(result.hasPreviousPage).toBe(false);
	});

	it("handles empty array", () => {
		const result = paginate<TestMetadata>([], { pageSize: 5, currentPage: 1 });

		expect(result.items).toHaveLength(0);
		expect(result.totalPages).toBe(1);
		expect(result.totalItems).toBe(0);
		expect(result.hasNextPage).toBe(false);
		expect(result.hasPreviousPage).toBe(false);
	});

	it("sets hasNextPage and hasPreviousPage correctly", () => {
		const entries = makeEntries(10);

		const first = paginate(entries, { pageSize: 3, currentPage: 1 });
		expect(first.hasPreviousPage).toBe(false);
		expect(first.hasNextPage).toBe(true);

		const middle = paginate(entries, { pageSize: 3, currentPage: 2 });
		expect(middle.hasPreviousPage).toBe(true);
		expect(middle.hasNextPage).toBe(true);

		const last = paginate(entries, { pageSize: 3, currentPage: 4 });
		expect(last.hasPreviousPage).toBe(true);
		expect(last.hasNextPage).toBe(false);
	});
});
