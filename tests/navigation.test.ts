import { beforeEach, describe, expect, it } from "bun:test";
import {
	type Collection,
	getGlobalStore,
	resetGlobalStore,
} from "../src/plugin/collection-store";
import {
	getAdjacentEntries,
	getBreadcrumbs,
	getEntryUrl,
} from "../src/runtime/navigation";

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
			metadata: { title: `Post ${i}`, order: i },
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
		tree: [],
	};
}

describe("getBreadcrumbs", () => {
	it("generates crumbs from a simple collection name", () => {
		const crumbs = getBreadcrumbs("blog");

		expect(crumbs).toEqual([{ label: "Blog", path: "/blog" }]);
	});

	it("generates crumbs from a nested collection name", () => {
		const crumbs = getBreadcrumbs("docs/guides");

		expect(crumbs).toEqual([
			{ label: "Docs", path: "/docs" },
			{ label: "Guides", path: "/docs/guides" },
		]);
	});

	it("appends a slug crumb when provided", () => {
		const crumbs = getBreadcrumbs("blog", "getting-started");

		expect(crumbs).toHaveLength(2);
		expect(crumbs[1]).toEqual({
			label: "Getting Started",
			path: "/blog/getting-started",
		});
	});

	it("uses custom labels from options", () => {
		const crumbs = getBreadcrumbs("docs/guides", undefined, {
			labels: { docs: "Documentation", guides: "User Guides" },
		});

		expect(crumbs[0].label).toBe("Documentation");
		expect(crumbs[1].label).toBe("User Guides");
	});

	it("applies basePath prefix", () => {
		const crumbs = getBreadcrumbs("blog", "my-post", {
			basePath: "/en",
		});

		expect(crumbs[0].path).toBe("/en/blog");
		expect(crumbs[1].path).toBe("/en/blog/my-post");
	});

	it("strips trailing slashes from basePath", () => {
		const crumbs = getBreadcrumbs("blog", undefined, {
			basePath: "/en/",
		});

		expect(crumbs[0].path).toBe("/en/blog");
	});

	it("excludes current entry when includeCurrent is false", () => {
		const crumbs = getBreadcrumbs("docs/guides", "intro", {
			includeCurrent: false,
		});

		expect(crumbs).toHaveLength(2);
		expect(crumbs[1].label).toBe("Guides");
	});

	it("uses currentLabel when provided", () => {
		const crumbs = getBreadcrumbs("blog", "my-post", {
			currentLabel: "My Custom Title",
		});

		expect(crumbs[1].label).toBe("My Custom Title");
	});

	it("title-cases hyphenated segments", () => {
		const crumbs = getBreadcrumbs("getting-started");

		expect(crumbs[0].label).toBe("Getting Started");
	});

	it("title-cases underscored segments", () => {
		const crumbs = getBreadcrumbs("getting_started");

		expect(crumbs[0].label).toBe("Getting Started");
	});

	it("returns empty array for empty collection name with no slug", () => {
		const crumbs = getBreadcrumbs("");

		expect(crumbs).toEqual([]);
	});
});

describe("getAdjacentEntries", () => {
	beforeEach(() => {
		resetGlobalStore();
	});

	it("returns prev and next entries", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog", 3));

		const { prev, next } = getAdjacentEntries("blog", "post-1");

		expect(prev?.slug).toBe("post-0");
		expect(next?.slug).toBe("post-2");
	});

	it("returns undefined prev for the first entry", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog", 3));

		const { prev, next } = getAdjacentEntries("blog", "post-0");

		expect(prev).toBeUndefined();
		expect(next?.slug).toBe("post-1");
	});

	it("returns undefined next for the last entry", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog", 3));

		const { prev, next } = getAdjacentEntries("blog", "post-2");

		expect(prev?.slug).toBe("post-1");
		expect(next).toBeUndefined();
	});

	it("returns both undefined when slug is not found", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog", 3));

		const { prev, next } = getAdjacentEntries("blog", "nonexistent");

		expect(prev).toBeUndefined();
		expect(next).toBeUndefined();
	});

	it("sorts by metadata key before finding adjacent entries", () => {
		const store = getGlobalStore();
		const col = makeCollection("blog", "/pages/blog", 3);
		col.entries[0].metadata = { title: "C", order: 2 };
		col.entries[1].metadata = { title: "A", order: 0 };
		col.entries[2].metadata = { title: "B", order: 1 };
		store.set("/pages/blog", col);

		const { prev, next } = getAdjacentEntries("blog", "post-2", {
			sortBy: "order",
			order: "asc",
		});

		expect(prev?.slug).toBe("post-1");
		expect(next?.slug).toBe("post-0");
	});

	it("handles single-entry collection", () => {
		const store = getGlobalStore();
		store.set("/pages/blog", makeCollection("blog", "/pages/blog", 1));

		const { prev, next } = getAdjacentEntries("blog", "post-0");

		expect(prev).toBeUndefined();
		expect(next).toBeUndefined();
	});

	it("throws for unknown collection", () => {
		expect(() => getAdjacentEntries("missing", "post-0")).toThrow(
			/Collection "missing" not found/,
		);
	});
});

describe("getEntryUrl", () => {
	it("generates a simple URL from collection and slug", () => {
		const url = getEntryUrl("blog", "my-post");

		expect(url).toBe("/blog/my-post");
	});

	it("handles nested collection names", () => {
		const url = getEntryUrl("docs/guides", "getting-started");

		expect(url).toBe("/docs/guides/getting-started");
	});

	it("applies basePath prefix", () => {
		const url = getEntryUrl("blog", "my-post", { basePath: "/en" });

		expect(url).toBe("/en/blog/my-post");
	});

	it("strips trailing slashes from basePath", () => {
		const url = getEntryUrl("blog", "my-post", { basePath: "/en/" });

		expect(url).toBe("/en/blog/my-post");
	});

	it("appends file extension", () => {
		const url = getEntryUrl("blog", "my-post", { extension: ".html" });

		expect(url).toBe("/blog/my-post.html");
	});

	it("combines basePath and extension", () => {
		const url = getEntryUrl("docs", "intro", {
			basePath: "/en",
			extension: ".html",
		});

		expect(url).toBe("/en/docs/intro.html");
	});

	it("defaults to / basePath and no extension", () => {
		const url = getEntryUrl("blog", "post");

		expect(url).toBe("/blog/post");
	});
});
