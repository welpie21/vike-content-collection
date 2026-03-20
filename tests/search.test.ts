import { beforeEach, describe, expect, it } from "bun:test";
import {
	type Collection,
	getGlobalStore,
	resetGlobalStore,
} from "../src/plugin/collection-store";
import { getRelatedEntries } from "../src/runtime/search";

function makeTaggedCollection(
	name: string,
	configDir: string,
	items: { slug: string; tags: string[]; category: string }[],
): Collection {
	const entries = items.map((item) => ({
		filePath: `${configDir}/${item.slug}.md`,
		slug: item.slug,
		metadata: { title: item.slug, tags: item.tags, category: item.category },
		content: `Body of ${item.slug}`,
		computed: {},
		lastModified: undefined,
		_isDraft: false,
		lineMap: { title: 2 },
	}));

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

describe("getRelatedEntries", () => {
	beforeEach(() => {
		resetGlobalStore();
	});

	it("finds related entries by shared tags", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeTaggedCollection("blog", "/pages/blog", [
				{ slug: "post-a", tags: ["js", "react"], category: "tutorial" },
				{ slug: "post-b", tags: ["js", "vue"], category: "tutorial" },
				{ slug: "post-c", tags: ["python"], category: "guide" },
				{ slug: "post-d", tags: ["js", "react", "next"], category: "tutorial" },
			]),
		);

		const related = getRelatedEntries("blog", "post-a", { by: ["tags"] });

		expect(related.length).toBeGreaterThan(0);
		expect(related[0].slug).toBe("post-d");
		expect(related[1].slug).toBe("post-b");
	});

	it("scores across multiple fields", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeTaggedCollection("blog", "/pages/blog", [
				{ slug: "post-a", tags: ["js"], category: "tutorial" },
				{ slug: "post-b", tags: ["js"], category: "guide" },
				{ slug: "post-c", tags: ["python"], category: "tutorial" },
			]),
		);

		const related = getRelatedEntries("blog", "post-a", {
			by: ["tags", "category"],
		});

		expect(related[0].slug).toBe("post-b");
	});

	it("respects limit option", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeTaggedCollection("blog", "/pages/blog", [
				{ slug: "post-a", tags: ["js"], category: "tutorial" },
				{ slug: "post-b", tags: ["js"], category: "tutorial" },
				{ slug: "post-c", tags: ["js"], category: "tutorial" },
				{ slug: "post-d", tags: ["js"], category: "tutorial" },
			]),
		);

		const related = getRelatedEntries("blog", "post-a", {
			by: ["tags"],
			limit: 2,
		});

		expect(related).toHaveLength(2);
	});

	it("excludes the current entry from results", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeTaggedCollection("blog", "/pages/blog", [
				{ slug: "post-a", tags: ["js"], category: "tutorial" },
				{ slug: "post-b", tags: ["js"], category: "tutorial" },
			]),
		);

		const related = getRelatedEntries("blog", "post-a", { by: ["tags"] });

		expect(related.every((e) => e.slug !== "post-a")).toBe(true);
	});

	it("returns empty array when slug is not found", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeTaggedCollection("blog", "/pages/blog", [
				{ slug: "post-a", tags: ["js"], category: "tutorial" },
			]),
		);

		const related = getRelatedEntries("blog", "nonexistent", {
			by: ["tags"],
		});

		expect(related).toEqual([]);
	});

	it("returns empty array when no entries share values", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeTaggedCollection("blog", "/pages/blog", [
				{ slug: "post-a", tags: ["js"], category: "tutorial" },
				{ slug: "post-b", tags: ["python"], category: "guide" },
			]),
		);

		const related = getRelatedEntries("blog", "post-a", { by: ["tags"] });

		expect(related).toEqual([]);
	});

	it("defaults limit to 5", () => {
		const store = getGlobalStore();
		const items = Array.from({ length: 10 }, (_, i) => ({
			slug: `post-${i}`,
			tags: ["shared"],
			category: "cat",
		}));
		store.set(
			"/pages/blog",
			makeTaggedCollection("blog", "/pages/blog", items),
		);

		const related = getRelatedEntries("blog", "post-0", { by: ["tags"] });

		expect(related).toHaveLength(5);
	});
});
