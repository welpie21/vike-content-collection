import { beforeEach, describe, expect, it } from "bun:test";
import {
	type Collection,
	getGlobalStore,
	resetGlobalStore,
} from "../src/plugin/collection-store";
import {
	groupBy,
	mergeCollections,
	paginate,
	sortCollection,
	uniqueValues,
} from "../src/runtime/helpers";
import type { TypedCollectionEntry } from "../src/types/index";

interface TestMetadata {
	title: string;
	date: Date;
	order: number;
}

interface TaggedMetadata {
	title: string;
	tags: string[];
	category?: string;
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

function makeTaggedEntries(
	items: Partial<TaggedMetadata>[],
): TypedCollectionEntry<TaggedMetadata>[] {
	const index: Record<string, TypedCollectionEntry<TaggedMetadata>> = {};
	return items.map((meta, i) => {
		const entry: TypedCollectionEntry<TaggedMetadata> = {
			filePath: `/pages/blog/post-${i}.md`,
			slug: `post-${i}`,
			metadata: {
				title: meta.title ?? `Post ${i}`,
				tags: meta.tags ?? [],
				category: meta.category,
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

describe("groupBy", () => {
	it("groups entries by a scalar metadata key", () => {
		const entries = makeTaggedEntries([
			{ category: "tutorial" },
			{ category: "tutorial" },
			{ category: "guide" },
		]);

		const groups = groupBy(entries, "category");

		expect(groups.size).toBe(2);
		expect(groups.get("tutorial")).toHaveLength(2);
		expect(groups.get("guide")).toHaveLength(1);
	});

	it("groups entries by an array metadata key", () => {
		const entries = makeTaggedEntries([
			{ tags: ["js", "react"] },
			{ tags: ["js", "vue"] },
			{ tags: ["python"] },
		]);

		const groups = groupBy(entries, "tags");

		expect(groups.size).toBe(4);
		expect(groups.get("js")).toHaveLength(2);
		expect(groups.get("react")).toHaveLength(1);
		expect(groups.get("vue")).toHaveLength(1);
		expect(groups.get("python")).toHaveLength(1);
	});

	it("skips entries where key is undefined", () => {
		const entries = makeTaggedEntries([
			{ category: "tutorial" },
			{ category: undefined },
		]);

		const groups = groupBy(entries, "category");

		expect(groups.size).toBe(1);
		expect(groups.get("tutorial")).toHaveLength(1);
	});

	it("handles empty entries array", () => {
		const groups = groupBy<TaggedMetadata>([], "tags");

		expect(groups.size).toBe(0);
	});

	it("handles entries with empty array values", () => {
		const entries = makeTaggedEntries([{ tags: [] }, { tags: ["js"] }]);

		const groups = groupBy(entries, "tags");

		expect(groups.size).toBe(1);
		expect(groups.get("js")).toHaveLength(1);
	});

	it("places the same entry in multiple groups for array fields", () => {
		const entries = makeTaggedEntries([{ tags: ["a", "b", "c"] }]);

		const groups = groupBy(entries, "tags");

		expect(groups.size).toBe(3);
		expect(groups.get("a")?.[0].slug).toBe("post-0");
		expect(groups.get("b")?.[0].slug).toBe("post-0");
		expect(groups.get("c")?.[0].slug).toBe("post-0");
	});
});

function makeStoreCollection(
	name: string,
	configDir: string,
	entryCount: number,
): Collection {
	const index: Record<string, Collection["entries"][number]> = {};
	const entries = Array.from({ length: entryCount }, (_, i) => {
		const slug = `entry-${i}`;
		const entry = {
			filePath: `${configDir}/${slug}.md`,
			slug,
			metadata: { title: `Entry ${i}` },
			content: `Body ${i}`,
			computed: {},
			lastModified: undefined,
			_isDraft: false,
			lineMap: { title: 2 },
			index,
		};
		index[slug] = entry;
		return entry;
	});

	return {
		name,
		type: "content" as const,
		configDir,
		configPath: `${configDir}/+Content.ts`,
		markdownDir: configDir,
		entries,
	};
}

describe("uniqueValues", () => {
	it("extracts unique scalar values", () => {
		const entries = makeTaggedEntries([
			{ category: "tutorial" },
			{ category: "guide" },
			{ category: "tutorial" },
		]);

		const values = uniqueValues(entries, "category");

		expect(values).toEqual(["guide", "tutorial"]);
	});

	it("flattens array values", () => {
		const entries = makeTaggedEntries([
			{ tags: ["js", "react"] },
			{ tags: ["js", "vue"] },
			{ tags: ["python"] },
		]);

		const values = uniqueValues(entries, "tags");

		expect(values).toEqual(["js", "python", "react", "vue"]);
	});

	it("skips undefined values", () => {
		const entries = makeTaggedEntries([
			{ category: "tutorial" },
			{ category: undefined },
		]);

		const values = uniqueValues(entries, "category");

		expect(values).toEqual(["tutorial"]);
	});

	it("returns sorted results", () => {
		const entries = makeTaggedEntries([{ tags: ["zebra", "apple", "mango"] }]);

		const values = uniqueValues(entries, "tags");

		expect(values).toEqual(["apple", "mango", "zebra"]);
	});

	it("handles empty entries array", () => {
		const values = uniqueValues<TaggedMetadata>([], "tags");

		expect(values).toEqual([]);
	});
});

describe("mergeCollections", () => {
	beforeEach(() => {
		resetGlobalStore();
	});

	it("merges entries from multiple collections", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeStoreCollection("blog", "/pages/blog", 2));
		store.set("/pages/news", makeStoreCollection("news", "/pages/news", 3));

		const merged = mergeCollections(["blog", "news"]);

		expect(merged).toHaveLength(5);
	});

	it("returns empty array for empty names list", () => {
		const merged = mergeCollections([]);

		expect(merged).toEqual([]);
	});

	it("preserves entries from all collections", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeStoreCollection("blog", "/pages/blog", 1));
		store.set("/pages/docs", makeStoreCollection("docs", "/pages/docs", 1));

		const merged = mergeCollections(["blog", "docs"]);
		const paths = merged.map((e) => e.filePath);

		expect(paths).toContain("/pages/blog/entry-0.md");
		expect(paths).toContain("/pages/docs/entry-0.md");
	});

	it("throws for unknown collection", () => {
		expect(() => mergeCollections(["nonexistent"])).toThrow(
			/Collection "nonexistent" not found/,
		);
	});
});
