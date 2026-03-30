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
	getCollectionTree,
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
		tree: { name: "", fullName: "", children: [] },
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

function makeCollectionWithSlugs(
	name: string,
	configDir: string,
	slugs: string[],
): Collection {
	const entries = slugs.map((slug) => ({
		filePath: `${configDir}/${slug}.md`,
		slug,
		metadata: { title: slug },
		content: "",
		computed: {},
		lastModified: undefined,
		_isDraft: false,
		lineMap: {},
	}));

	return {
		name,
		type: "content" as const,
		configDir,
		configPath: `${configDir}/+Content.ts`,
		markdownDir: configDir,
		entries,
		index: new Map(entries.map((e) => [e.slug, e])),
		tree: { name: "", fullName: "", children: [] },
	};
}

describe("getCollectionTree", () => {
	beforeEach(() => {
		resetGlobalStore();
	});

	it("returns a root FolderNode with children from top-level slugs", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeCollectionWithSlugs("blog", "/pages/blog", [
				"hello-world",
				"second-post",
			]),
		);

		const root = getCollectionTree("blog");

		expect(root.name).toBe("");
		expect(root.children).toHaveLength(2);
		expect(root.children[0].name).toBe("hello-world");
		expect(root.children[0].fullName).toBe("hello-world");
		expect("entry" in root.children[0]).toBe(true);
		expect((root.children[0] as any).entry.slug).toBe("hello-world");
		expect(root.children[1].name).toBe("second-post");
		expect(root.children[1].fullName).toBe("second-post");
	});

	it("builds a nested tree with FolderNodes and EntryNodes", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/docs",
			makeCollectionWithSlugs("docs", "/pages/docs", [
				"intro",
				"guides/installation",
				"guides/configuration",
				"api/overview",
			]),
		);

		const root = getCollectionTree("docs");

		expect(root.children).toHaveLength(3);
		expect(root.children[0].name).toBe("intro");
		expect(root.children[0].fullName).toBe("intro");
		expect("entry" in root.children[0]).toBe(true);

		const guides = root.children[1] as any;
		expect(guides.name).toBe("guides");
		expect(guides.fullName).toBe("guides");
		expect(guides.children).toHaveLength(2);
		expect(guides.children[0].name).toBe("installation");
		expect(guides.children[0].fullName).toBe("guides/installation");
		expect("entry" in guides.children[0]).toBe(true);
		expect(guides.children[1].name).toBe("configuration");

		const api = root.children[2] as any;
		expect(api.name).toBe("api");
		expect(api.fullName).toBe("api");
		expect(api.children).toHaveLength(1);
		expect(api.children[0].fullName).toBe("api/overview");
	});

	it("creates intermediate FolderNodes with their path as fullName", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/docs",
			makeCollectionWithSlugs("docs", "/pages/docs", [
				"guides/getting-started",
			]),
		);

		const root = getCollectionTree("docs");

		expect(root.children).toHaveLength(1);
		expect(root.children[0].name).toBe("guides");
		expect(root.children[0].fullName).toBe("guides");
		expect("children" in root.children[0]).toBe(true);

		const folder = root.children[0] as any;
		expect(folder.children[0].name).toBe("getting-started");
		expect(folder.children[0].fullName).toBe("guides/getting-started");
		expect("entry" in folder.children[0]).toBe(true);
	});

	it("sets fullName on FolderNode when segment is also an entry", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/docs",
			makeCollectionWithSlugs("docs", "/pages/docs", [
				"guides",
				"guides/installation",
			]),
		);

		const root = getCollectionTree("docs");

		expect(root.children).toHaveLength(1);
		const folder = root.children[0] as any;
		expect(folder.name).toBe("guides");
		expect(folder.fullName).toBe("guides");
		expect(folder.children).toHaveLength(1);
		expect(folder.children[0].fullName).toBe("guides/installation");
		expect("entry" in folder.children[0]).toBe(true);
	});

	it("handles deeply nested slugs", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/docs",
			makeCollectionWithSlugs("docs", "/pages/docs", ["a/b/c/d"]),
		);

		const root = getCollectionTree("docs");

		expect(root.children).toHaveLength(1);
		const a = root.children[0] as any;
		expect(a.name).toBe("a");
		expect(a.fullName).toBe("a");
		expect(a.children[0].name).toBe("b");
		expect(a.children[0].fullName).toBe("a/b");
		expect(a.children[0].children[0].name).toBe("c");

		const d = a.children[0].children[0].children[0];
		expect(d.name).toBe("d");
		expect(d.fullName).toBe("a/b/c/d");
		expect("entry" in d).toBe(true);
	});

	it("returns empty root for collection with no entries", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeCollectionWithSlugs("blog", "/pages/blog", []),
		);

		const root = getCollectionTree("blog");

		expect(root.name).toBe("");
		expect(root.children).toEqual([]);
		expect(root.entry).toBeUndefined();
	});

	it("throws for unknown collection", () => {
		expect(() => getCollectionTree("missing")).toThrow(
			/Collection "missing" not found/,
		);
	});

	it("places empty-slug entry on the root FolderNode", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/docs",
			makeCollectionWithSlugs("docs", "/pages/docs", [
				"",
				"intro",
				"guides/setup",
			]),
		);

		const root = getCollectionTree("docs");

		expect(root.entry).toBeDefined();
		expect(root.entry?.slug).toBe("");
		expect(root.fullName).toBe("");
		expect(root.children).toHaveLength(2);
		expect(root.children[0].name).toBe("intro");
		expect(root.children[1].name).toBe("guides");
	});

	it("reflects tree updates after updateEntry", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeCollectionWithSlugs("blog", "/pages/blog", ["post-a"]),
		);

		store.updateEntry("/pages/blog", {
			filePath: "/pages/blog/guides/new.md",
			slug: "guides/new",
			metadata: {},
			content: "",
			computed: {},
			lastModified: undefined,
			_isDraft: false,
			lineMap: {},
		});

		const root = getCollectionTree("blog");

		expect(root.children).toHaveLength(2);
		expect(root.children[0].name).toBe("post-a");
		expect(root.children[1].name).toBe("guides");
		expect((root.children[1] as any).children[0].name).toBe("new");
	});

	it("reflects tree updates after removeEntry", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeCollectionWithSlugs("blog", "/pages/blog", [
				"post-a",
				"guides/intro",
			]),
		);

		store.removeEntry("/pages/blog", "guides/intro");

		const root = getCollectionTree("blog");

		expect(root.children).toHaveLength(1);
		expect(root.children[0].name).toBe("post-a");
	});
});
