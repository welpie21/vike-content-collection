import { beforeEach, describe, expect, it } from "bun:test";
import {
	type Collection,
	getGlobalStore,
	resetGlobalStore,
} from "../src/plugin/collection-store";
import { getSeries } from "../src/runtime/series";

function makeSeriesCollection(
	name: string,
	configDir: string,
	items: { slug: string; series?: string; seriesOrder?: number }[],
): Collection {
	const entries = items.map((item) => ({
		filePath: `${configDir}/${item.slug}.md`,
		slug: item.slug,
		metadata: {
			title: item.slug,
			series: item.series,
			seriesOrder: item.seriesOrder,
		},
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
		tree: [],
	};
}

describe("getSeries", () => {
	beforeEach(() => {
		resetGlobalStore();
	});

	it("returns a series with ordered entries", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeSeriesCollection("blog", "/pages/blog", [
				{ slug: "part-3", series: "react", seriesOrder: 3 },
				{ slug: "part-1", series: "react", seriesOrder: 1 },
				{ slug: "part-2", series: "react", seriesOrder: 2 },
				{ slug: "unrelated", series: "vue", seriesOrder: 1 },
			]),
		);

		const result = getSeries("blog", "part-2", "react");

		expect(result).toBeDefined();
		expect(result?.name).toBe("react");
		expect(result?.total).toBe(3);
		expect(result?.entries.map((e) => e.slug)).toEqual([
			"part-1",
			"part-2",
			"part-3",
		]);
	});

	it("sets currentIndex correctly", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeSeriesCollection("blog", "/pages/blog", [
				{ slug: "part-1", series: "react", seriesOrder: 1 },
				{ slug: "part-2", series: "react", seriesOrder: 2 },
				{ slug: "part-3", series: "react", seriesOrder: 3 },
			]),
		);

		const result = getSeries("blog", "part-2", "react");

		expect(result?.currentIndex).toBe(1);
	});

	it("provides prev and next entries", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeSeriesCollection("blog", "/pages/blog", [
				{ slug: "part-1", series: "react", seriesOrder: 1 },
				{ slug: "part-2", series: "react", seriesOrder: 2 },
				{ slug: "part-3", series: "react", seriesOrder: 3 },
			]),
		);

		const result = getSeries("blog", "part-2", "react");

		expect(result?.prev?.slug).toBe("part-1");
		expect(result?.next?.slug).toBe("part-3");
	});

	it("returns undefined prev for first entry", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeSeriesCollection("blog", "/pages/blog", [
				{ slug: "part-1", series: "react", seriesOrder: 1 },
				{ slug: "part-2", series: "react", seriesOrder: 2 },
			]),
		);

		const result = getSeries("blog", "part-1", "react");

		expect(result?.prev).toBeUndefined();
		expect(result?.next?.slug).toBe("part-2");
	});

	it("returns undefined next for last entry", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeSeriesCollection("blog", "/pages/blog", [
				{ slug: "part-1", series: "react", seriesOrder: 1 },
				{ slug: "part-2", series: "react", seriesOrder: 2 },
			]),
		);

		const result = getSeries("blog", "part-2", "react");

		expect(result?.prev?.slug).toBe("part-1");
		expect(result?.next).toBeUndefined();
	});

	it("returns undefined when series has no entries", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeSeriesCollection("blog", "/pages/blog", [
				{ slug: "post-1", series: "vue", seriesOrder: 1 },
			]),
		);

		const result = getSeries("blog", "post-1", "nonexistent");

		expect(result).toBeUndefined();
	});

	it("returns undefined when slug is not in the series", () => {
		const store = getGlobalStore();
		store.set(
			"/pages/blog",
			makeSeriesCollection("blog", "/pages/blog", [
				{ slug: "part-1", series: "react", seriesOrder: 1 },
				{ slug: "unrelated" },
			]),
		);

		const result = getSeries("blog", "unrelated", "react");

		expect(result).toBeUndefined();
	});

	it("supports custom field names", () => {
		const store = getGlobalStore();
		const entries = [
			{
				filePath: "/pages/blog/a.md",
				slug: "a",
				metadata: { title: "A", course: "intro", part: 2 },
				content: "",
				computed: {},
				lastModified: undefined,
				_isDraft: false,
				lineMap: {},
			},
			{
				filePath: "/pages/blog/b.md",
				slug: "b",
				metadata: { title: "B", course: "intro", part: 1 },
				content: "",
				computed: {},
				lastModified: undefined,
				_isDraft: false,
				lineMap: {},
			},
		];
		store.set("/pages/blog", {
			name: "blog",
			type: "content" as const,
			configDir: "/pages/blog",
			configPath: "/pages/blog/+Content.ts",
			markdownDir: "/pages/blog",
			entries,
			index: new Map(entries.map((e) => [e.slug, e])),
			tree: [],
		});

		const result = getSeries("blog", "a", "intro", {
			seriesField: "course",
			orderField: "part",
		});

		expect(result).toBeDefined();
		expect(result?.entries[0].slug).toBe("b");
		expect(result?.entries[1].slug).toBe("a");
		expect(result?.currentIndex).toBe(1);
	});
});
