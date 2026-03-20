import type { CollectionEntry } from "../src/plugin/collection-store";
import {
	getGlobalStore,
	resetGlobalStore,
} from "../src/plugin/collection-store";
import {
	findCollectionEntries,
	getCollection,
	getCollectionEntry,
} from "../src/runtime/get-collection";
import {
	groupBy,
	paginate,
	sortCollection,
	uniqueValues,
} from "../src/runtime/helpers";
import { getLocalizedEntry } from "../src/runtime/i18n";
import { getBreadcrumbs, getEntryUrl } from "../src/runtime/navigation";
import { buildTocTree, extractHeadings } from "../src/runtime/render";
import { getRelatedEntries } from "../src/runtime/search";
import { getSeries } from "../src/runtime/series";
import type { Heading, TypedCollectionEntry } from "../src/types/index";
import { suite } from "./runner";

const s = suite("runtime");

// ── Fixtures ────────────────────────────────────────────────

interface BlogMetadata {
	title: string;
	date: Date;
	order: number;
	tags: string[];
	category: string;
}

const tagPool = [
	"javascript",
	"typescript",
	"react",
	"vue",
	"svelte",
	"node",
	"deno",
	"bun",
	"css",
	"html",
	"wasm",
	"rust",
	"go",
	"python",
];

const categoryPool = [
	"tutorial",
	"guide",
	"reference",
	"deep-dive",
	"quickstart",
	"opinion",
];

function makeEntries(count: number): TypedCollectionEntry<BlogMetadata>[] {
	return Array.from({ length: count }, (_, i) => ({
		filePath: `/content/blog/post-${i}.md`,
		slug: `post-${i}`,
		metadata: {
			title: `Post ${String.fromCharCode(65 + (i % 26))}${i}`,
			date: new Date(2025, i % 12, (i % 28) + 1),
			order: count - i,
			tags: tagPool.slice(i % tagPool.length, (i % tagPool.length) + 3),
			category: categoryPool[i % categoryPool.length],
		},
		content: `# Post ${i}\n\nContent for post ${i}.\n`,
		computed: {},
		lastModified: undefined,
	}));
}

const entries100 = makeEntries(100);
const entries1000 = makeEntries(1000);
const entries5000 = makeEntries(5000);

const markdownForHeadings = `
# Introduction

Some intro text.

## Getting Started

### Prerequisites

Install the required tools.

### Installation

Run the install command.

## Core Concepts

### Components

Components are the building blocks.

#### Props

Pass data via props.

#### State

Manage internal state.

### Routing

Handle navigation.

## Advanced Topics

### Performance

Optimize for speed.

### Testing

Write robust tests.

#### Unit Tests

Test individual units.

#### Integration Tests

Test combined modules.

### Deployment

Ship to production.

## API Reference

### Configuration

Set up the config.

### Methods

Available methods.

### Events

Emitted events.

## Conclusion

Wrap up.
`;

const preExtractedHeadings: Heading[] = [
	{ depth: 1, text: "Introduction", id: "introduction" },
	{ depth: 2, text: "Getting Started", id: "getting-started" },
	{ depth: 3, text: "Prerequisites", id: "prerequisites" },
	{ depth: 3, text: "Installation", id: "installation" },
	{ depth: 2, text: "Core Concepts", id: "core-concepts" },
	{ depth: 3, text: "Components", id: "components" },
	{ depth: 4, text: "Props", id: "props" },
	{ depth: 4, text: "State", id: "state" },
	{ depth: 3, text: "Routing", id: "routing" },
	{ depth: 2, text: "Advanced Topics", id: "advanced-topics" },
	{ depth: 3, text: "Performance", id: "performance" },
	{ depth: 3, text: "Testing", id: "testing" },
	{ depth: 4, text: "Unit Tests", id: "unit-tests" },
	{ depth: 4, text: "Integration Tests", id: "integration-tests" },
	{ depth: 3, text: "Deployment", id: "deployment" },
	{ depth: 2, text: "API Reference", id: "api-reference" },
	{ depth: 3, text: "Configuration", id: "configuration" },
	{ depth: 3, text: "Methods", id: "methods" },
	{ depth: 3, text: "Events", id: "events" },
	{ depth: 1, text: "Conclusion", id: "conclusion" },
];

// ── Benchmarks ──────────────────────────────────────────────

s.add("sortCollection (100 entries, string)", () => {
	sortCollection(entries100, "title", "asc");
});

s.add("sortCollection (1000 entries, date)", () => {
	sortCollection(entries1000, "date", "desc");
});

s.add("sortCollection (5000 entries, number)", () => {
	sortCollection(entries5000, "order", "asc");
});

s.add("groupBy (1000 entries, scalar)", () => {
	groupBy(entries1000, "category");
});

s.add("groupBy (1000 entries, array)", () => {
	groupBy(entries1000, "tags");
});

s.add("paginate (1000 entries)", () => {
	paginate(entries1000, { pageSize: 20, currentPage: 25 });
});

s.add("uniqueValues (1000 entries, array field)", () => {
	uniqueValues(entries1000, "tags");
});

s.add("buildTocTree (20 headings)", () => {
	buildTocTree(preExtractedHeadings);
});

s.add("extractHeadings (large doc)", async () => {
	await extractHeadings(markdownForHeadings);
});

s.add("getBreadcrumbs (deep path)", () => {
	getBreadcrumbs("docs/guides/advanced/topics", "my-entry", {
		labels: { docs: "Documentation", guides: "Guides" },
		basePath: "/",
		includeCurrent: true,
	});
});

s.add("getEntryUrl", () => {
	getEntryUrl("docs/guides", "getting-started", {
		basePath: "/en",
		extension: ".html",
	});
});

// ── Store-backed benchmarks ─────────────────────────────────

function makeStoreEntries(count: number): CollectionEntry[] {
	return Array.from({ length: count }, (_, i) => ({
		filePath: `/content/blog/post-${i}.md`,
		slug: `post-${i}`,
		metadata: {
			title: `Post ${String.fromCharCode(65 + (i % 26))}${i}`,
			date: new Date(2025, i % 12, (i % 28) + 1),
			order: count - i,
			tags: tagPool.slice(i % tagPool.length, (i % tagPool.length) + 3),
			category: categoryPool[i % categoryPool.length],
			series: i % 3 === 0 ? "main-series" : undefined,
			seriesOrder: i % 3 === 0 ? i : undefined,
			locale: undefined,
		},
		content: `# Post ${i}\n\nContent for post ${i}.\n`,
		computed: {},
		lastModified: undefined,
		_isDraft: false,
		lineMap: { title: 2 },
	}));
}

function setupStore(count: number) {
	resetGlobalStore();
	const store = getGlobalStore();
	const entries = makeStoreEntries(count);
	store.set("/content/blog", {
		name: "blog",
		type: "content",
		configDir: "/content/blog",
		configPath: "/content/blog/+Content.ts",
		markdownDir: "/content/blog",
		entries,
		index: new Map(entries.map((e) => [e.slug, e])),
	});

	const localeEntries: CollectionEntry[] = [];
	for (let i = 0; i < 50; i++) {
		localeEntries.push({
			filePath: `/content/docs/page-${i}.md`,
			slug: `page-${i}`,
			metadata: { title: `Page ${i}`, locale: "en" },
			content: "",
			computed: {},
			lastModified: undefined,
			_isDraft: false,
			lineMap: {},
		});
		localeEntries.push({
			filePath: `/content/docs/page-${i}.fr.md`,
			slug: `page-${i}.fr`,
			metadata: { title: `Page ${i} FR`, locale: "fr" },
			content: "",
			computed: {},
			lastModified: undefined,
			_isDraft: false,
			lineMap: {},
		});
	}
	store.set("/content/docs", {
		name: "docs",
		type: "content",
		configDir: "/content/docs",
		configPath: "/content/docs/+Content.ts",
		markdownDir: "/content/docs",
		entries: localeEntries,
		index: new Map(localeEntries.map((e) => [e.slug, e])),
	});
}

setupStore(1000);

s.add("getCollectionEntry (1000 entries, O(1) index lookup)", () => {
	getCollectionEntry("blog", "post-500");
});

s.add("getCollection (1000 entries)", () => {
	getCollection("blog");
});

s.add("getRelatedEntries (1000 entries, by tags+category)", () => {
	getRelatedEntries("blog", "post-0", { by: ["tags", "category"], limit: 5 });
});

s.add("getLocalizedEntry (suffix, 100 entries)", () => {
	getLocalizedEntry("docs", "page-25", "fr");
});

s.add("getSeries (1000 entries)", () => {
	getSeries("blog", "post-0", "main-series");
});

s.add("findCollectionEntries (1000 entries, RegExp)", () => {
	findCollectionEntries("blog", /post-[0-9]$/);
});

s.add("findCollectionEntries (1000 entries, string array)", () => {
	findCollectionEntries("blog", ["post-0", "post-500", "post-999"]);
});

export default s;
