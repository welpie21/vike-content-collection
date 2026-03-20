import { beforeEach, describe, expect, it } from "bun:test";
import {
	type Collection,
	getGlobalStore,
	resetGlobalStore,
} from "../src/plugin/collection-store";
import {
	findCollectionEntries,
	getCollection,
	getCollectionEntry,
} from "../src/runtime/get-collection";

function makeCollection(
	name: string,
	configDir: string,
	entryCount: number = 1,
): Collection {
	const entries = Array.from({ length: entryCount }, (_, i) => {
		const slug = `post-${i}`;
		return {
			filePath: `${configDir}/${slug}.md`,
			slug,
			metadata: { title: `Post ${i}`, index: i },
			content: `Body of post ${i}`,
			computed: {},
			lastModified: undefined,
			_isDraft: false,
			lineMap: { title: 2 },
		};
	});

	return {
		name,
		type: "content" as const,
		configDir,
		configPath: `${configDir}/+Content.ts`,
		markdownDir: configDir,
		entries,
		index: new Map(entries.map((e) => [e.slug, e])),
	};
}

describe("getCollection", () => {
	beforeEach(() => {
		resetGlobalStore();
	});

	it("returns entries for a known collection", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog", 2));

		const entries = getCollection("blog");

		expect(entries).toHaveLength(2);
		expect(entries[0].filePath).toBe("/pages/blog/post-0.md");
		expect(entries[0].metadata).toEqual({ title: "Post 0", index: 0 });
		expect(entries[0].content).toBe("Body of post 0");
	});

	it("does not include lineMap in returned entries", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog"));

		const entries = getCollection("blog");

		expect(entries[0]).not.toHaveProperty("lineMap");
	});

	it("throws for an unknown collection name", () => {
		expect(() => getCollection("nonexistent")).toThrow(
			/Collection "nonexistent" not found/,
		);
	});

	it("lists available collections in the error message", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog"));
		store.set("/pages/docs", makeCollection("docs", "/pages/docs"));

		try {
			getCollection("missing");
		} catch (err) {
			const msg = (err as Error).message;
			expect(msg).toContain('"blog"');
			expect(msg).toContain('"docs"');
		}
	});

	it("shows (none) when no collections exist", () => {
		try {
			getCollection("anything");
		} catch (err) {
			expect((err as Error).message).toContain("(none)");
		}
	});

	it("retrieves nested collection names", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/docs/guides",
			makeCollection("docs/guides", "/pages/docs/guides", 3),
		);

		const entries = getCollection("docs/guides");

		expect(entries).toHaveLength(3);
	});

	it("returns a new array each time (no shared references)", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog"));

		const first = getCollection("blog");
		const second = getCollection("blog");

		expect(first).not.toBe(second);
		expect(first).toEqual(second);
	});

	it("includes computed fields in returned entries", () => {
		const store = getGlobalStore();
		const col = makeCollection("blog", "/pages/blog", 1);
		col.entries[0].computed = { readingTime: 3 };
		store.set("/pages/blog", col);

		const entries = getCollection("blog");

		expect(entries[0].computed).toEqual({ readingTime: 3 });
	});

	it("includes lastModified in returned entries", () => {
		const store = getGlobalStore();
		const col = makeCollection("blog", "/pages/blog", 1);
		const date = new Date("2025-01-01T00:00:00Z");
		col.entries[0].lastModified = date;
		store.set("/pages/blog", col);

		const entries = getCollection("blog");

		expect(entries[0].lastModified).toEqual(date);
	});

	it("does not include _isDraft in returned entries", () => {
		const store = getGlobalStore();
		const col = makeCollection("blog", "/pages/blog", 1);
		col.entries[0]._isDraft = true;
		store.set("/pages/blog", col);

		const entries = getCollection("blog");

		expect(entries[0]).not.toHaveProperty("_isDraft");
	});
});

describe("getCollectionEntry", () => {
	beforeEach(() => {
		resetGlobalStore();
	});

	it("finds a single entry by slug", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog", 3));

		const entry = getCollectionEntry("blog", "post-1");

		expect(entry).not.toBeArray();
		expect(entry?.filePath).toBe("/pages/blog/post-1.md");
		expect(entry?.metadata).toEqual({ title: "Post 1", index: 1 });
		expect(entry?.content).toBe("Body of post 1");
	});

	it("returns undefined when slug is not found", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog", 1));

		const entry = getCollectionEntry("blog", "nonexistent");

		expect(entry).toBeUndefined();
	});

	it("throws for unknown collection", () => {
		expect(() => getCollectionEntry("missing", "post-0")).toThrow(
			/Collection "missing" not found/,
		);
	});

	it("does not include lineMap in returned entry", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog", 1));

		const entry = getCollectionEntry("blog", "post-0");

		expect(entry).not.toHaveProperty("lineMap");
	});

	it("works with nested collection names", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/docs/guides",
			makeCollection("docs/guides", "/pages/docs/guides", 2),
		);

		const entry = getCollectionEntry("docs/guides", "post-0");

		expect(entry?.filePath).toBe("/pages/docs/guides/post-0.md");
	});
});

describe("findCollectionEntries", () => {
	beforeEach(() => {
		resetGlobalStore();
	});

	it("filters entries with a predicate function", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog", 5));

		const entries = findCollectionEntries(
			"blog",
			(e) => (e.metadata as Record<string, any>).index >= 3,
		);

		expect(entries).toBeArray();
		expect(entries).toHaveLength(2);
		expect(entries[0].filePath).toBe("/pages/blog/post-3.md");
		expect(entries[1].filePath).toBe("/pages/blog/post-4.md");
	});

	it("returns empty array when no entries match the predicate", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog", 3));

		const entries = findCollectionEntries("blog", () => false);

		expect(entries).toBeArray();
		expect(entries).toHaveLength(0);
	});

	it("filters entries by RegExp", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog", 5));

		const entries = findCollectionEntries("blog", /post-[0-2]/);

		expect(entries).toBeArray();
		expect(entries).toHaveLength(3);
	});

	it("filters entries by array of filters (OR semantics)", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog", 5));

		const entries = findCollectionEntries("blog", ["post-0", /post-4/]);

		expect(entries).toBeArray();
		expect(entries).toHaveLength(2);
		expect(entries[0].filePath).toBe("/pages/blog/post-0.md");
		expect(entries[1].filePath).toBe("/pages/blog/post-4.md");
	});

	it("throws for unknown collection", () => {
		expect(() => findCollectionEntries("missing", /./)).toThrow(
			/Collection "missing" not found/,
		);
	});

	it("does not include lineMap in returned entries", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog", 1));

		const entries = findCollectionEntries("blog", () => true);

		expect(entries[0]).not.toHaveProperty("lineMap");
	});
});
