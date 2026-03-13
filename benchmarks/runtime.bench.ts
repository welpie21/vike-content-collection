import {
	groupBy,
	paginate,
	sortCollection,
	uniqueValues,
} from "../src/runtime/helpers";
import { getBreadcrumbs, getEntryUrl } from "../src/runtime/navigation";
import { buildTocTree, extractHeadings } from "../src/runtime/render";
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
	const index: Record<string, TypedCollectionEntry<BlogMetadata>> = {};
	const entries = Array.from({ length: count }, (_, i) => {
		const entry: TypedCollectionEntry<BlogMetadata> = {
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
			_isDraft: false,
			index,
		};
		index[entry.slug] = entry;
		return entry;
	});
	return entries;
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

export default s;
