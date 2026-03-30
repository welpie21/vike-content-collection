import { beforeEach, describe, expect, it } from "bun:test";
import {
	buildCollectionTree,
	type Collection,
	CollectionStore,
	getGlobalStore,
	hydrateGlobalStore,
	resetGlobalStore,
} from "../src/plugin/collection-store";

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
			content: `Content of post ${i}`,
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

describe("CollectionStore", () => {
	let store: CollectionStore;

	beforeEach(() => {
		store = new CollectionStore();
	});

	it("starts empty", () => {
		expect(store.getAll()).toEqual([]);
		expect(store.has("/pages/blog")).toBe(false);
	});

	it("stores and retrieves a collection", () => {
		const collection = makeCollection("blog", "/pages/blog");
		store.set("/pages/blog", collection);

		expect(store.has("/pages/blog")).toBe(true);
		expect(store.get("/pages/blog")).toBe(collection);
	});

	it("returns undefined for missing collections", () => {
		expect(store.get("/pages/missing")).toBeUndefined();
	});

	it("overwrites an existing collection", () => {
		const first = makeCollection("blog", "/pages/blog", 1);
		const second = makeCollection("blog", "/pages/blog", 3);

		store.set("/pages/blog", first);
		store.set("/pages/blog", second);

		expect(store.get("/pages/blog")?.entries).toHaveLength(3);
	});

	it("returns all collections", () => {
		store.set("/pages/blog", makeCollection("blog", "/pages/blog"));
		store.set("/pages/docs", makeCollection("docs", "/pages/docs"));

		const all = store.getAll();

		expect(all).toHaveLength(2);
	});

	it("deletes a collection", () => {
		store.set("/pages/blog", makeCollection("blog", "/pages/blog"));

		const deleted = store.delete("/pages/blog");

		expect(deleted).toBe(true);
		expect(store.has("/pages/blog")).toBe(false);
	});

	it("returns false when deleting a non-existent collection", () => {
		expect(store.delete("/pages/missing")).toBe(false);
	});

	it("clears all collections", () => {
		store.set("/pages/blog", makeCollection("blog", "/pages/blog"));
		store.set("/pages/docs", makeCollection("docs", "/pages/docs"));

		store.clear();

		expect(store.getAll()).toEqual([]);
		expect(store.has("/pages/blog")).toBe(false);
		expect(store.has("/pages/docs")).toBe(false);
	});

	describe("getByName", () => {
		it("retrieves a collection by its name", () => {
			const collection = makeCollection("blog", "/pages/blog");
			store.set("/pages/blog", collection);

			expect(store.getByName("blog")).toBe(collection);
		});

		it("returns undefined for unknown name", () => {
			store.set("/pages/blog", makeCollection("blog", "/pages/blog"));

			expect(store.getByName("missing")).toBeUndefined();
		});

		it("finds nested collection names", () => {
			const collection = makeCollection("docs/guides", "/pages/docs/guides");
			store.set("/pages/docs/guides", collection);

			expect(store.getByName("docs/guides")).toBe(collection);
		});
	});

	describe("toSerializable", () => {
		it("returns empty object when store is empty", () => {
			expect(store.toSerializable()).toEqual({});
		});

		it("serializes collections without lineMap", () => {
			store.set("/pages/blog", makeCollection("blog", "/pages/blog", 2));

			const serialized = store.toSerializable();

			expect(Object.keys(serialized)).toEqual(["/pages/blog"]);
			expect(serialized["/pages/blog"].entries).toHaveLength(2);

			const entry = serialized["/pages/blog"].entries[0];
			expect(entry).toHaveProperty("filePath");
			expect(entry).toHaveProperty("metadata");
			expect(entry).toHaveProperty("content");
			expect(entry).not.toHaveProperty("lineMap");
		});

		it("includes collection name in serialized output", () => {
			store.set("/pages/blog", makeCollection("blog", "/pages/blog", 1));

			const serialized = store.toSerializable();

			expect(serialized["/pages/blog"].name).toBe("blog");
		});

		it("preserves frontmatter data in serialized output", () => {
			store.set("/pages/blog", makeCollection("blog", "/pages/blog", 1));

			const serialized = store.toSerializable();
			const entry = serialized["/pages/blog"].entries[0];

			expect(entry.metadata).toEqual({ title: "Post 0", index: 0 });
			expect(entry.filePath).toBe("/pages/blog/post-0.md");
			expect(entry.content).toBe("Content of post 0");
		});

		it("preserves type: 'both' in serialized output", () => {
			const collection = makeCollection("mixed", "/pages/mixed");
			collection.type = "both";
			store.set("/pages/mixed", collection);

			const serialized = store.toSerializable();

			expect(serialized["/pages/mixed"].type).toBe("both");
		});

		it("serializes multiple collections", () => {
			store.set("/pages/blog", makeCollection("blog", "/pages/blog", 1));
			store.set("/pages/docs", makeCollection("docs", "/pages/docs", 3));

			const serialized = store.toSerializable();

			expect(Object.keys(serialized)).toHaveLength(2);
			expect(serialized["/pages/blog"].entries).toHaveLength(1);
			expect(serialized["/pages/docs"].entries).toHaveLength(3);
		});
	});

	describe("updateEntry", () => {
		it("updates an existing entry by slug", () => {
			store.set("/pages/blog", makeCollection("blog", "/pages/blog", 2));
			const updated = {
				filePath: "/pages/blog/post-0.md",
				slug: "post-0",
				metadata: { title: "Updated Post 0", index: 99 },
				content: "Updated content",
				computed: {},
				lastModified: undefined,
				_isDraft: false,
				lineMap: { title: 2 },
			};

			store.updateEntry("/pages/blog", updated);

			const collection = store.get("/pages/blog");
			expect(collection?.entries).toHaveLength(2);
			expect(collection?.entries[0].metadata.title).toBe("Updated Post 0");
		});

		it("adds a new entry when slug does not exist", () => {
			store.set("/pages/blog", makeCollection("blog", "/pages/blog", 1));
			const newEntry = {
				filePath: "/pages/blog/new-post.md",
				slug: "new-post",
				metadata: { title: "New Post" },
				content: "New content",
				computed: {},
				lastModified: undefined,
				_isDraft: false,
				lineMap: { title: 2 },
			};

			store.updateEntry("/pages/blog", newEntry);

			const collection = store.get("/pages/blog");
			expect(collection?.entries).toHaveLength(2);
		});

		it("does nothing when configDir does not exist", () => {
			const entry = {
				filePath: "/pages/blog/post.md",
				slug: "post",
				metadata: {},
				content: "",
				computed: {},
				lastModified: undefined,
				_isDraft: false,
				lineMap: {},
			};
			store.updateEntry("/pages/missing", entry);
			expect(store.getAll()).toHaveLength(0);
		});
	});

	describe("removeEntry", () => {
		it("removes an entry by slug", () => {
			store.set("/pages/blog", makeCollection("blog", "/pages/blog", 3));

			store.removeEntry("/pages/blog", "post-1");

			const collection = store.get("/pages/blog");

			expect(collection?.entries).toHaveLength(2);
			expect(
				collection?.entries.find((e) => e.slug === "post-1"),
			).toBeUndefined();
		});

		it("does nothing for non-existent slug", () => {
			store.set("/pages/blog", makeCollection("blog", "/pages/blog", 2));

			store.removeEntry("/pages/blog", "nonexistent");

			expect(store.get("/pages/blog")?.entries).toHaveLength(2);
		});

		it("does nothing for non-existent configDir", () => {
			store.removeEntry("/pages/missing", "post-0");
			expect(store.getAll()).toHaveLength(0);
		});
	});
});

describe("toSerializable with circular metadata", () => {
	it("produces JSON-safe output when metadata has circular references", () => {
		const store = new CollectionStore();
		const circularMeta: Record<string, unknown> = { title: "Test" };
		circularMeta.self = circularMeta;

		const collection = makeCollection("blog", "/pages/blog", 1);
		collection.entries[0].metadata = circularMeta;

		store.set("/pages/blog", collection);
		const serialized = store.toSerializable();

		expect(() => JSON.stringify(serialized)).not.toThrow();
		expect(serialized["/pages/blog"].entries[0].metadata.title).toBe("Test");
		expect(serialized["/pages/blog"].entries[0].metadata.self).toBeNull();
	});

	it("produces JSON-safe output when computed has circular references", () => {
		const store = new CollectionStore();
		const circularComputed: Record<string, unknown> = { score: 10 };
		circularComputed.ref = circularComputed;

		const collection = makeCollection("blog", "/pages/blog", 1);
		collection.entries[0].computed = circularComputed;

		store.set("/pages/blog", collection);
		const serialized = store.toSerializable();

		expect(() => JSON.stringify(serialized)).not.toThrow();
		expect(serialized["/pages/blog"].entries[0].computed.score).toBe(10);
		expect(serialized["/pages/blog"].entries[0].computed.ref).toBeNull();
	});
});

describe("Global store", () => {
	beforeEach(() => {
		resetGlobalStore();
	});

	it("returns a shared singleton", () => {
		const a = getGlobalStore();
		const b = getGlobalStore();

		expect(a).toBe(b);
	});

	it("resets to a fresh instance", () => {
		const first = getGlobalStore();
		first.set("/pages/blog", makeCollection("blog", "/pages/blog"));

		resetGlobalStore();
		const second = getGlobalStore();

		expect(second).not.toBe(first);
		expect(second.getAll()).toEqual([]);
	});
});

describe("hydrateGlobalStore", () => {
	beforeEach(() => {
		resetGlobalStore();
	});

	it("populates an empty store from serialized data", () => {
		hydrateGlobalStore({
			"/content/blog": {
				name: "blog",
				type: "content",
				entries: [
					{
						filePath: "/content/blog/hello.md",
						slug: "hello",
						metadata: { title: "Hello" },
						content: "# Hello",
						computed: {},
						lastModified: "2024-01-01T00:00:00.000Z",
						_isDraft: false,
					},
				],
			},
		});

		const store = getGlobalStore();
		const collection = store.getByName("blog");

		expect(collection).toBeDefined();
		expect(collection?.entries).toHaveLength(1);
		expect(collection?.entries[0].slug).toBe("hello");
		expect(collection?.entries[0].lastModified).toEqual(
			new Date("2024-01-01T00:00:00.000Z"),
		);
	});

	it("makes collections accessible by name", () => {
		hydrateGlobalStore({
			"/content/docs": {
				name: "docs",
				type: "content",
				entries: [
					{
						filePath: "/content/docs/intro.md",
						slug: "intro",
						metadata: { title: "Intro" },
						content: "",
						computed: {},
						lastModified: undefined,
						_isDraft: false,
					},
				],
			},
		});

		const store = getGlobalStore();
		expect(store.getByName("docs")).toBeDefined();
		expect(store.getByName("docs")?.name).toBe("docs");
	});

	it("builds slug index for entry lookup", () => {
		hydrateGlobalStore({
			"/content/blog": {
				name: "blog",
				type: "content",
				entries: [
					{
						filePath: "/content/blog/a.md",
						slug: "a",
						metadata: {},
						content: "",
						computed: {},
						lastModified: undefined,
						_isDraft: false,
					},
					{
						filePath: "/content/blog/b.md",
						slug: "b",
						metadata: {},
						content: "",
						computed: {},
						lastModified: undefined,
						_isDraft: false,
					},
				],
			},
		});

		const store = getGlobalStore();
		const collection = store.getByName("blog");

		expect(collection?.index.get("a")).toBeDefined();
		expect(collection?.index.get("b")).toBeDefined();
		expect(collection?.index.get("c")).toBeUndefined();
	});

	it("skips collections that already have entries", () => {
		const store = getGlobalStore();
		store.set("/content/blog", makeCollection("blog", "/content/blog", 3));

		hydrateGlobalStore({
			"/content/blog": {
				name: "blog",
				type: "content",
				entries: [
					{
						filePath: "/content/blog/x.md",
						slug: "x",
						metadata: {},
						content: "",
						computed: {},
						lastModified: undefined,
						_isDraft: false,
					},
				],
			},
		});

		expect(store.getByName("blog")?.entries).toHaveLength(3);
	});

	it("hydrates multiple collections at once", () => {
		hydrateGlobalStore({
			"/content/blog": {
				name: "blog",
				type: "content",
				entries: [
					{
						filePath: "/content/blog/a.md",
						slug: "a",
						metadata: {},
						content: "",
						computed: {},
						lastModified: undefined,
						_isDraft: false,
					},
				],
			},
			"/content/docs": {
				name: "docs",
				type: "data",
				entries: [
					{
						filePath: "/content/docs/x.json",
						slug: "x",
						metadata: {},
						content: "",
						computed: {},
						lastModified: undefined,
						_isDraft: false,
					},
					{
						filePath: "/content/docs/y.json",
						slug: "y",
						metadata: {},
						content: "",
						computed: {},
						lastModified: undefined,
						_isDraft: false,
					},
				],
			},
		});

		const store = getGlobalStore();
		expect(store.getByName("blog")?.entries).toHaveLength(1);
		expect(store.getByName("docs")?.entries).toHaveLength(2);
		expect(store.getByName("docs")?.type).toBe("data");
	});

	it("hydrates a collection with type: 'both'", () => {
		hydrateGlobalStore({
			"/content/mixed": {
				name: "mixed",
				type: "both",
				entries: [
					{
						filePath: "/content/mixed/post.mdx",
						slug: "post",
						metadata: { title: "Post" },
						content: "# Post body",
						computed: {},
						lastModified: undefined,
						_isDraft: false,
					},
					{
						filePath: "/content/mixed/meta.json",
						slug: "meta",
						metadata: { label: "Section" },
						content: "",
						computed: {},
						lastModified: undefined,
						_isDraft: false,
					},
				],
			},
		});

		const store = getGlobalStore();
		const collection = store.getByName("mixed");

		expect(collection).toBeDefined();
		expect(collection?.type).toBe("both");
		expect(collection?.entries).toHaveLength(2);
		expect(collection?.entries[0].content).toBe("# Post body");
		expect(collection?.entries[1].content).toBe("");
	});

	it("round-trips through toSerializable", () => {
		const store = getGlobalStore();
		store.set("/content/blog", makeCollection("blog", "/content/blog", 2));

		const serialized = store.toSerializable();
		resetGlobalStore();

		hydrateGlobalStore(serialized);

		const hydrated = getGlobalStore();
		const collection = hydrated.getByName("blog");

		expect(collection).toBeDefined();
		expect(collection?.entries).toHaveLength(2);
		expect(collection?.entries[0].slug).toBe("post-0");
		expect(collection?.entries[1].slug).toBe("post-1");
	});

	it("round-trips tree through toSerializable", () => {
		const store = getGlobalStore();
		const col: Collection = {
			name: "docs",
			type: "content",
			configDir: "/content/docs",
			configPath: "/content/docs/+Content.ts",
			markdownDir: "/content/docs",
			entries: [
				{
					filePath: "/content/docs/intro.md",
					slug: "intro",
					metadata: {},
					content: "",
					computed: {},
					lastModified: undefined,
					_isDraft: false,
					lineMap: {},
				},
				{
					filePath: "/content/docs/guides/setup.md",
					slug: "guides/setup",
					metadata: {},
					content: "",
					computed: {},
					lastModified: undefined,
					_isDraft: false,
					lineMap: {},
				},
			],
			index: new Map(),
			tree: { name: "", fullName: "", children: [] },
		};
		col.index = new Map(col.entries.map((e) => [e.slug, e]));
		store.set("/content/docs", col);

		const serialized = store.toSerializable();
		resetGlobalStore();

		hydrateGlobalStore(serialized);

		const hydrated = getGlobalStore();
		const collection = hydrated.getByName("docs");

		expect(collection).toBeDefined();
		const tree = collection?.tree;
		expect(tree.children).toHaveLength(2);
		expect(tree.children[0].name).toBe("intro");
		expect(tree.children[0].fullName).toBe("intro");
		expect("entry" in tree.children[0]).toBe(true);
		expect(tree.children[1].name).toBe("guides");
		expect("children" in tree.children[1]).toBe(true);
		expect((tree.children[1] as any).children[0].name).toBe("setup");
	});
});

describe("buildCollectionTree", () => {
	function makeEntries(slugs: string[]) {
		return slugs.map((slug) => ({
			filePath: `/${slug}.md`,
			slug,
			metadata: {},
			content: "",
			computed: {},
			lastModified: undefined,
			_isDraft: false,
			lineMap: {},
		}));
	}

	it("returns an empty root FolderNode for no entries", () => {
		const root = buildCollectionTree([]);
		expect(root.name).toBe("");
		expect(root.fullName).toBe("");
		expect(root.children).toEqual([]);
		expect(root.entry).toBeUndefined();
	});

	it("creates EntryNodes for single-segment slugs", () => {
		const root = buildCollectionTree(makeEntries(["alpha", "beta"]));

		expect(root.children).toHaveLength(2);
		expect(root.children[0].name).toBe("alpha");
		expect(root.children[0].fullName).toBe("alpha");
		expect("entry" in root.children[0]).toBe(true);
		expect((root.children[0] as any).entry.slug).toBe("alpha");
		expect(root.children[1].name).toBe("beta");
		expect("entry" in root.children[1]).toBe(true);
	});

	it("groups entries into FolderNodes by shared path segments", () => {
		const root = buildCollectionTree(
			makeEntries(["guides/install", "guides/config"]),
		);

		expect(root.children).toHaveLength(1);
		expect(root.children[0].name).toBe("guides");
		expect(root.children[0].fullName).toBe("guides");
		expect("children" in root.children[0]).toBe(true);
		expect((root.children[0] as any).children).toHaveLength(2);
		expect("entry" in (root.children[0] as any).children[0]).toBe(true);
	});

	it("creates a FolderNode with fullName and entry when slug also has children", () => {
		const root = buildCollectionTree(makeEntries(["guides", "guides/install"]));

		expect(root.children[0].name).toBe("guides");
		expect(root.children[0].fullName).toBe("guides");
		expect("children" in root.children[0]).toBe(true);
		expect((root.children[0] as any).children).toHaveLength(1);
		expect((root.children[0] as any).children[0].name).toBe("install");
		expect("entry" in root.children[0]).toBe(true);
		expect((root.children[0] as any).entry.slug).toBe("guides");
	});

	it("attaches entry to folder regardless of processing order", () => {
		const root = buildCollectionTree(
			makeEntries(["guides/install", "guides/config", "guides"]),
		);

		expect(root.children[0].name).toBe("guides");
		expect(root.children[0].fullName).toBe("guides");
		expect("children" in root.children[0]).toBe(true);
		expect((root.children[0] as any).children).toHaveLength(2);
		expect("entry" in root.children[0]).toBe(true);
		expect((root.children[0] as any).entry.slug).toBe("guides");
	});

	it("does not attach entry to folders without matching slug", () => {
		const root = buildCollectionTree(
			makeEntries(["guides/install", "guides/config"]),
		);

		expect(root.children[0].name).toBe("guides");
		expect(root.children[0].fullName).toBe("guides");
		expect("children" in root.children[0]).toBe(true);
		expect("entry" in root.children[0]).toBe(false);
	});

	it("places empty-slug entry on the root FolderNode", () => {
		const root = buildCollectionTree(
			makeEntries(["", "about", "guides/install"]),
		);

		expect(root.entry).toBeDefined();
		expect(root.entry?.slug).toBe("");
		expect(root.fullName).toBe("");
		expect(root.children).toHaveLength(2);
		expect(root.children[0].name).toBe("about");
		expect(root.children[1].name).toBe("guides");
	});

	it("returns root without entry when no index slug exists", () => {
		const root = buildCollectionTree(makeEntries(["about", "contact"]));

		expect(root.entry).toBeUndefined();
		expect(root.fullName).toBe("");
		expect(root.children).toHaveLength(2);
	});
});
