import { beforeEach, describe, expect, it } from "bun:test";
import {
	type Collection,
	CollectionStore,
	getGlobalStore,
	resetGlobalStore,
} from "../src/plugin/collection-store";

function makeCollection(
	name: string,
	configDir: string,
	entryCount: number = 1,
): Collection {
	const index: Record<string, Collection["entries"][number]> = {};
	const entries = Array.from({ length: entryCount }, (_, i) => {
		const slug = `post-${i}`;
		const entry = {
			filePath: `${configDir}/${slug}.md`,
			slug,
			frontmatter: { title: `Post ${i}`, index: i },
			content: `Content of post ${i}`,
			lineMap: { title: 2 },
			index,
		};
		index[slug] = entry;
		return entry;
	});

	return {
		name,
		configDir,
		configPath: `${configDir}/+Content.ts`,
		markdownDir: configDir,
		entries,
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
			expect(entry).toHaveProperty("frontmatter");
			expect(entry).toHaveProperty("content");
			expect(entry).not.toHaveProperty("lineMap");
		});

		it("preserves frontmatter data in serialized output", () => {
			store.set("/pages/blog", makeCollection("blog", "/pages/blog", 1));

			const serialized = store.toSerializable();
			const entry = serialized["/pages/blog"].entries[0];

			expect(entry.frontmatter).toEqual({ title: "Post 0", index: 0 });
			expect(entry.filePath).toBe("/pages/blog/post-0.md");
			expect(entry.content).toBe("Content of post 0");
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
