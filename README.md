# vike-content-collection

Type-safe, schema-validated content collections for [Vike](https://vike.dev/) + [Vite](https://vite.dev/).

Define a [Zod](https://zod.dev/) schema, drop in your markdown files, and get fully typed content with validated frontmatter -- at dev time and build time.

## Documentation

| Guide | Description |
| ----- | ----------- |
| [Getting Started](./docs/getting-started.md) | Installation, setup, and your first collection |
| [Defining Collections](./docs/defining-collections.md) | Schema formats, data collections, content directories |
| [Querying Data](./docs/querying-data.md) | `getCollection`, `getCollectionEntry`, usage patterns |
| [Rendering Content](./docs/rendering.md) | Markdown to HTML, headings, custom plugins |
| [TypeScript Setup](./docs/typescript-setup.md) | Generated types, virtual module declarations, tsconfig |
| [Advanced Features](./docs/advanced-features.md) | Computed fields, references, drafts, sorting, and more |
| [Internationalization](./docs/i18n.md) | Multilingual content with slug suffix or metadata strategy |

## Features

- **Zod schema validation** -- frontmatter is parsed and validated with precise error reporting (file, line, column)
- **Full type inference** -- auto-generated declaration file powers typesafe `getCollection()` and `getCollectionEntry()`
- **Markdown, MDX & data collections** -- `.md` and `.mdx` files with frontmatter, or `.json` / `.yaml` / `.toml` data files
- **Built-in rendering** -- markdown and MDX to HTML via unified/remark/rehype, with heading extraction
- **Pluggable renderers** -- use the built-in markdown or MDX renderer, or implement your own `ContentRenderer`
- **Computed fields** -- derive reading time, excerpts, or any value from each entry
- **Collection references** -- cross-collection slug validation
- **Draft mode** -- drafts visible in dev, excluded in production
- **Navigation helpers** -- breadcrumbs, next/previous links, entry URLs, and collection tree for site navigation
- **Content discovery** -- related entries by shared metadata, cross-collection merge, unique values extraction
- **Content series** -- ordered multi-part content sequences with series-aware navigation
- **i18n support** -- locale detection and localized entry lookup via slug suffix or metadata
- **Grouping & TOC** -- group entries by any metadata key, build nested table-of-contents trees from headings
- **Server-only by default** -- runtime APIs automatically return safe no-op stubs on the client, keeping Node.js code out of the browser bundle
- **HMR** -- incremental updates on file changes during development
- **Virtual module** -- `virtual:content-collection` exposes data to other Vite plugins

## Quick Start

### 1. Install

```bash
npm install vike-content-collection
```

Peer dependencies (if not already installed):

```bash
npm install vike vite zod
```

### 2. Add the Vite plugin

```ts
// vite.config.ts
import vikeContentCollection from 'vike-content-collection'

export default {
  plugins: [vikeContentCollection()],
  ssr: {
    external: ['vike-content-collection']
  }
}
```

Marking the package as `ssr.external` ensures Vite doesn't bundle it during SSR, which is required for the plugin to work correctly. The plugin automatically provides no-op stubs for client-side bundles, so Node.js-specific code is never shipped to the browser.

### 3. Extend the Vike config

```ts
// +config.ts (root or pages-level)
import vikeContentCollectionConfig from 'vike-content-collection/config'

export default {
  extends: [vikeContentCollectionConfig]
}
```

### 4. Define a collection

Create a `+Content.ts` in any page directory:

```ts
// pages/blog/+Content.ts
import { z } from 'zod'

export const Content = z.object({
  title: z.string(),
  date: z.date(),
  tags: z.array(z.string()).optional()
})
```

### 5. Add content

Place `.md` or `.mdx` files alongside (or in subdirectories of) the `+Content.ts`:

```md
---
title: "Getting Started"
date: 2025-03-10T00:00:00.000Z
tags:
  - tutorial
---

Welcome to the blog.
```

### 6. Query your collection

```ts
// pages/blog/+data.ts
import { getCollection } from 'vike-content-collection'

export function data() {
  const posts = getCollection('blog')
  return { posts }
}
```

That's it. `posts` is fully typed based on your Zod schema.

---

## Guide

### Defining collections

The simplest form exports `Content` as a Zod schema:

```ts
export const Content = z.object({
  title: z.string(),
  date: z.date()
})
```

For more control, export an object with a `schema` property:

```ts
export const Content = {
  schema: z.object({
    title: z.string(),
    date: z.date(),
    draft: z.boolean().default(false),
    permalink: z.string().optional()
  }),
  computed: {
    readingTime: ({ content }) => Math.ceil(content.split(/\s+/).length / 200),
  },
  slug: ({ metadata, defaultSlug }) => metadata.permalink ?? defaultSlug,
  contentPath: 'articles', // fetch files from <contentRoot>/articles/ instead of the default
}
```

Both named and default exports are supported:

```ts
export const Content = z.object({ ... })           // named (recommended)
export default { Content: z.object({ ... }) }       // default with Content property
export default z.object({ ... })                    // direct default
```

> If the export has a `safeParse` method it is treated as a plain Zod schema; otherwise the plugin expects a `schema` property.

### Collection names

The collection name is derived from the directory where `+Content.ts` lives:

| `+Content.ts` location          | Collection name |
| -------------------------------- | --------------- |
| `pages/blog/+Content.ts`        | `"blog"`        |
| `pages/docs/guides/+Content.ts` | `"docs/guides"` |

### Data collections

For structured data without a markdown body (author profiles, navigation config, etc.), set `type: 'data'`. The plugin scans for `.json`, `.yaml`/`.yml`, and `.toml` files instead of `.md`:

```ts
// pages/authors/+Content.ts
import { z } from 'zod'

export const Content = {
  type: 'data',
  schema: z.object({
    name: z.string(),
    bio: z.string(),
    avatar: z.string().url()
  })
}
```

Each file becomes one entry. The `content` field is an empty string for data entries.

### Content directory

By default, content files live alongside their `+Content.ts`. Set `contentRoot` to keep them separate:

```ts
vikeContentCollection({ contentRoot: 'content' })
```

With this config, a collection defined at `pages/blog/+Content.ts` loads files from `content/blog/`.

You can also override the content folder on a per-collection basis using `contentPath` in the extended config:

```ts
// pages/blog/+Content.ts
export const Content = {
  schema: z.object({ title: z.string() }),
  contentPath: 'articles', // loads from content/articles/ instead of content/blog/
}
```

---

### Querying collections

#### `getCollection(name)`

Returns all entries in a collection, fully typed:

```ts
import { getCollection } from 'vike-content-collection'

const posts = getCollection('blog')
```

#### `getCollectionEntry(name, filter)`

Retrieves specific entries. The filter determines the return type:

| Filter type | Example | Returns |
| ----------- | ------- | ------- |
| `string` | `'getting-started'` | Single entry or `undefined` |
| `RegExp` | `/^tutorial-/` | Array of matching entries |
| Predicate | `(e) => !e._isDraft` | Array of matching entries |
| Array | `['intro', /^guide-/]` | Array matching any filter (OR) |

```ts
import { getCollectionEntry } from 'vike-content-collection'

// Single entry by slug
const post = getCollectionEntry('blog', 'getting-started')

// Pattern match
const tutorials = getCollectionEntry('blog', /^tutorial-/)

// Predicate
const published = getCollectionEntry('blog', (e) => !e._isDraft)

// Combined filters (OR semantics)
const selected = getCollectionEntry('blog', [
  'intro',
  /^tutorial-/,
  (entry) => entry.metadata.featured === true,
])
```

#### Entry shape

Every entry returned by `getCollection` or `getCollectionEntry` has:

| Field          | Type                    | Description                                            |
| -------------- | ----------------------- | ------------------------------------------------------ |
| `filePath`     | `string`                | Absolute path to the source file                       |
| `slug`         | `string`                | Identifier derived from filename (or custom function)  |
| `metadata`     | Inferred from schema    | Validated frontmatter data                             |
| `content`      | `string`                | Raw markdown body (empty string for data entries)      |
| `computed`     | `Record<string, unknown>` | Values from computed field functions                  |
| `lastModified` | `Date \| undefined`     | Git-based last modification date (opt-in)              |
| `_isDraft`     | `boolean`               | Whether the entry is a draft                           |
| `index`        | `Record<string, Entry>` | Lookup map of all entries in the same collection       |

---

### Rendering markdown

Convert an entry's markdown to HTML with `renderEntry()`:

```ts
import { getCollectionEntry, renderEntry } from 'vike-content-collection'

const post = getCollectionEntry('blog', 'getting-started')
if (post) {
  const { html, headings } = await renderEntry(post)
}
```

`headings` is an array of `{ depth, text, id }` extracted during rendering. Heading elements in the HTML include matching `id` attributes via `rehype-slug`.

#### Custom plugins

Pass remark or rehype plugins to extend rendering:

```ts
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

const { html } = await renderEntry(post, {
  remarkPlugins: [remarkGfm],
  rehypePlugins: [rehypeHighlight],
})
```

#### MDX rendering

Use `createMdxRenderer()` to render `.mdx` files that contain JSX syntax:

```ts
import { createMdxRenderer, renderEntry } from 'vike-content-collection'

const mdxRenderer = createMdxRenderer()
const { html, headings } = await renderEntry(post, { renderer: mdxRenderer })
```

#### Custom renderers

Implement the `ContentRenderer` interface to provide your own rendering pipeline:

```ts
import type { ContentRenderer } from 'vike-content-collection'

const myRenderer: ContentRenderer = {
  async render(content, options) {
    // Your custom rendering logic
    return { html: '<p>rendered</p>', headings: [] }
  }
}

const { html } = await renderEntry(post, { renderer: myRenderer })
```

#### Extracting headings only

Use `extractHeadings()` when you only need a table of contents (faster than a full render):

```ts
import { extractHeadings } from 'vike-content-collection'

const headings = await extractHeadings(post.content)
// [{ depth: 1, text: 'Title', id: 'title' }, ...]
```

---

### Computed fields

Derive additional data from each entry. Computed functions run after validation and receive `{ metadata, content, filePath, slug }`:

```ts
export const Content = {
  schema: z.object({ title: z.string() }),
  computed: {
    readingTime: ({ content }) => Math.ceil(content.split(/\s+/).length / 200),
    wordCount: ({ content }) => content.split(/\s+/).length,
    excerpt: ({ content }) => content.slice(0, 160).trim() + '...',
  }
}
```

Access computed values on entries:

```ts
const posts = getCollection('blog')
posts[0].computed.readingTime // number
posts[0].computed.excerpt     // string
```

---

### Collection references

Use `reference()` to validate that a metadata field points to an existing slug in another collection:

```ts
import { z } from 'zod'
import { reference } from 'vike-content-collection'

export const Content = z.object({
  title: z.string(),
  author: reference('authors'),
})
```

After all collections are loaded, the plugin runs a cross-collection validation pass and warns about broken references.

---

### Custom slugs

By default, slugs come from the filename (minus extension). Override with a `slug` function:

```ts
export const Content = {
  schema: z.object({
    title: z.string(),
    permalink: z.string().optional()
  }),
  slug: ({ metadata, filePath, defaultSlug }) =>
    metadata.permalink ?? defaultSlug,
}
```

---

### Draft mode

Entries with a truthy `draft` metadata field are automatically excluded in production builds. During development they remain visible with `_isDraft: true`.

Configure the draft field name or override filtering:

```ts
vikeContentCollection({
  drafts: {
    field: 'draft',         // metadata field to check (default: "draft")
    includeDrafts: false,   // force exclude even in dev
  }
})
```

---

### Sorting & pagination

#### `sortCollection(entries, key, order?)`

Sort entries by a metadata key. Returns a new array:

```ts
import { getCollection, sortCollection } from 'vike-content-collection'

const posts = getCollection('blog')
const byDate = sortCollection(posts, 'date', 'desc')   // newest first
const byTitle = sortCollection(posts, 'title', 'asc')  // alphabetical
```

Supports dates, numbers, and strings. Defaults to `'asc'`.

#### `paginate(entries, options)`

Split entries into pages:

```ts
import { paginate } from 'vike-content-collection'

const page = paginate(posts, { pageSize: 10, currentPage: 2 })

page.items           // entries for this page
page.currentPage     // 2
page.totalPages      // total number of pages
page.totalItems      // total entry count
page.hasNextPage     // boolean
page.hasPreviousPage // boolean
```

#### `groupBy(entries, key)`

Group entries by a metadata key. Array values (e.g. tags) place the entry in multiple groups:

```ts
import { getCollection, groupBy } from 'vike-content-collection'

const posts = getCollection('blog')
const byTag = groupBy(posts, 'tags')
// Map { 'javascript' => [...], 'react' => [...] }
```

---

### Navigation

#### `getBreadcrumbs(collectionName, slug?, options?)`

Generate breadcrumb trails from collection names and entry slugs:

```ts
import { getBreadcrumbs } from 'vike-content-collection'

const crumbs = getBreadcrumbs('docs/guides', 'getting-started', {
  labels: { docs: 'Documentation' },
})
// [
//   { label: 'Documentation', path: '/docs' },
//   { label: 'Guides', path: '/docs/guides' },
//   { label: 'Getting Started', path: '/docs/guides/getting-started' },
// ]
```

#### `getAdjacentEntries(name, currentSlug, options?)`

Find previous/next entries for navigation links:

```ts
import { getAdjacentEntries } from 'vike-content-collection'

const { prev, next } = getAdjacentEntries('blog', 'my-post', {
  sortBy: 'date',
  order: 'desc',
})
```

#### `getCollectionTree()`

Get all collections as a hierarchical tree (for sidebars):

```ts
import { getCollectionTree } from 'vike-content-collection'

const tree = getCollectionTree()
// [{ name: 'docs', fullName: 'docs', children: [...] }, ...]
```

#### `buildTocTree(headings)`

Convert flat headings into a nested table-of-contents tree:

```ts
import { extractHeadings, buildTocTree } from 'vike-content-collection'

const headings = await extractHeadings(post.content)
const toc = buildTocTree(headings)
// [{ depth: 2, text: 'Setup', id: 'setup', children: [...] }]
```

#### `getRelatedEntries(name, slug, options)`

Find entries related by shared metadata (tags, category, etc.):

```ts
import { getRelatedEntries } from 'vike-content-collection'

const related = getRelatedEntries('blog', 'my-post', {
  by: ['tags', 'category'],
  limit: 3,
})
```

#### `mergeCollections(names)`

Combine entries from multiple collections:

```ts
import { mergeCollections, sortCollection } from 'vike-content-collection'

const all = mergeCollections(['blog', 'news'])
const latest = sortCollection(all, 'date', 'desc')
```

#### `uniqueValues(entries, key)`

Get all unique values for a metadata key:

```ts
import { getCollection, uniqueValues } from 'vike-content-collection'

const allTags = uniqueValues(getCollection('blog'), 'tags')
// ['javascript', 'python', 'react']
```

#### `getEntryUrl(collectionName, slug, options?)`

Generate a URL path for an entry:

```ts
import { getEntryUrl } from 'vike-content-collection'

const url = getEntryUrl('docs/guides', 'intro', { basePath: '/en' })
// '/en/docs/guides/intro'
```

---

### Content series

#### `getSeries(name, currentSlug, seriesName, options?)`

Get an ordered series of entries with navigation:

```ts
import { getSeries } from 'vike-content-collection'

const series = getSeries('blog', 'part-2', 'react-tutorial')
// { name: 'react-tutorial', entries: [...], currentIndex: 1, total: 3, prev, next }
```

---

### i18n locales

#### `getAvailableLocales(name, baseSlug, options?)`

Get available locales for a base slug:

```ts
import { getAvailableLocales } from 'vike-content-collection'

const locales = getAvailableLocales('docs', 'getting-started')
// ['', 'de', 'fr']
```

#### `getLocalizedEntry(name, baseSlug, locale, options?)`

Get a specific localized version:

```ts
import { getLocalizedEntry } from 'vike-content-collection'

const frEntry = getLocalizedEntry('docs', 'getting-started', 'fr')
```

---

### Git last modified

Populate `lastModified` on each entry from `git log`:

```ts
vikeContentCollection({ lastModified: true })
```

```ts
const post = getCollectionEntry('blog', 'intro')
post?.lastModified // Date | undefined
```

Returns `undefined` if git is unavailable or the file is untracked.

---

### Type generation

The plugin generates `.vike-content-collection/types.d.ts` automatically on build, dev server start, and HMR. Add it to your `tsconfig.json`:

```json
{
  "include": [
    "src",
    ".vike-content-collection/**/*"
  ]
}
```

This powers full type inference for `getCollection()` and `getCollectionEntry()` -- no manual type annotations needed.

---

### Virtual module

Other Vite plugins or app code can import collection data directly:

```ts
import { collections } from 'virtual:content-collection'
```

`collections` is a record keyed by collection directory path. Each value contains `type` (`"content"` or `"data"`) and an `entries` array.

---

## Plugin Options

```ts
vikeContentCollection({
  contentDir: 'pages',
  contentRoot: 'content',
  drafts: {
    field: 'draft',
    includeDrafts: true,
  },
  lastModified: true,
})
```

| Option                 | Type      | Default                            | Description                                       |
| ---------------------- | --------- | ---------------------------------- | ------------------------------------------------- |
| `contentDir`           | `string`  | `"pages"`                          | Directory to scan for `+Content.ts` config files   |
| `contentRoot`          | `string`  | same as `contentDir`               | Directory where content/data files live            |
| `drafts.field`         | `string`  | `"draft"`                          | Metadata field name for draft status               |
| `drafts.includeDrafts` | `boolean` | `true` in dev, `false` in prod     | Force include or exclude draft entries             |
| `lastModified`         | `boolean` | `false`                            | Populate `lastModified` from git history           |

## Schema Validation Errors

When metadata fails validation, the build halts with a detailed error:

```
ContentCollectionValidationError: [vike-content-collection] Schema validation failed:
  pages/blog/post.md:4 (at "metadata.name"): Expected string, received number
```

Errors include the file path, line number, Zod error path, and validation message. This works identically in `vite build` and `vite dev` (surfaced via HMR).

## How It Works

1. **Scan** -- finds `+Content.ts` files in `contentDir` on `buildStart`
2. **Parse** -- extracts YAML frontmatter from `.md`/`.mdx` files (via [gray-matter](https://github.com/jonschlinkert/gray-matter)), or reads `.json`/`.yaml`/`.toml` for data collections
3. **Validate** -- checks each entry against its Zod schema, mapping errors back to source line numbers
4. **Compute** -- runs computed field functions on validated entries
5. **Filter** -- excludes draft entries in production
6. **Store** -- holds entries in memory, keyed by collection name
7. **References** -- verifies cross-collection `reference()` slugs exist
8. **Types** -- emits `.vike-content-collection/types.d.ts`
9. **Serve** -- exposes data through `virtual:content-collection`
10. **Client noop** -- intercepts client-side imports and replaces them with safe no-op stubs
11. **HMR** -- incrementally re-processes changed files, regenerates types, and invalidates the virtual module

## API Reference

### Functions

```ts
import {
  vikeContentCollectionPlugin,  // Vite plugin factory (also the default export)
  getCollection,                // all entries of a collection
  getCollectionEntry,           // filtered entries
  renderEntry,                  // content -> HTML (uses default or custom renderer)
  extractHeadings,              // headings from markdown
  buildTocTree,                 // nested TOC tree from flat headings
  createMarkdownRenderer,       // built-in markdown renderer factory
  createMdxRenderer,            // built-in MDX renderer factory
  sortCollection,               // sort by metadata key
  paginate,                     // paginate entries
  groupBy,                      // group entries by metadata key
  getBreadcrumbs,               // breadcrumb trail from collection path
  getAdjacentEntries,           // previous/next entries in a collection
  getCollectionTree,            // collection hierarchy as a tree
  getEntryUrl,                  // URL path for a collection entry
  getRelatedEntries,            // related entries by shared metadata
  mergeCollections,             // combine entries from multiple collections
  uniqueValues,                 // unique values for a metadata key
  getSeries,                    // ordered content series with navigation
  getAvailableLocales,          // available locales for an entry
  getLocalizedEntry,            // localized version of an entry
  reference,                    // cross-collection reference schema
} from 'vike-content-collection'
```

### Types

```ts
import type {
  ContentCollectionPluginOptions,
  ContentCollectionConfig,
  ContentCollectionDefinition,
  ResolvedContentConfig,
  ComputedFieldInput,
  SlugInput,
  CollectionMap,
  TypedCollectionEntry,
  CollectionEntryFilter,
  CollectionEntryFilterInput,
  CollectionEntryPredicate,
  ParsedMarkdown,
  MetadataLineMap,
  ValidationIssue,
  ContentRenderer,
  RenderResult,
  RenderOptions,
  Heading,
  TocNode,
  PaginationResult,
  Breadcrumb,
  BreadcrumbOptions,
  AdjacentEntries,
  CollectionTreeNode,
  EntryUrlOptions,
  RelatedEntriesOptions,
  SeriesResult,
  SeriesOptions,
  LocaleOptions,
} from 'vike-content-collection'
```

| Type | Description |
| ---- | ----------- |
| `ContentCollectionPluginOptions` | Options for `vikeContentCollection()` |
| `ContentCollectionConfig` | Shape of the `+Content.ts` export |
| `ContentCollectionDefinition` | Extended config with `schema`, `computed`, `slug`, `type`, `contentPath` |
| `ResolvedContentConfig` | Normalized config after resolving schema or definition |
| `ComputedFieldInput` | Input to computed field functions |
| `SlugInput` | Input to custom slug functions |
| `CollectionMap` | Augmentable interface mapping collection names to types |
| `TypedCollectionEntry<T, C>` | A single collection entry with typed metadata and computed fields |
| `CollectionEntryFilter<T>` | Single filter: `string`, `RegExp`, or predicate |
| `CollectionEntryFilterInput<T>` | One or more filters for `getCollectionEntry()` |
| `CollectionEntryPredicate<T>` | Predicate function for filtering entries |
| `ParsedMarkdown` | Result of parsing a markdown file |
| `MetadataLineMap` | Maps metadata key paths to line numbers |
| `ValidationIssue` | Validation error with file, line, path, and message |
| `ContentRenderer` | Interface for pluggable content renderers |
| `RenderResult` | `{ html: string, headings: Heading[] }` |
| `RenderOptions` | Custom `remarkPlugins`, `rehypePlugins`, and optional `renderer` |
| `Heading` | `{ depth: number, text: string, id: string }` |
| `PaginationResult<T>` | Paginated result with `items`, page info, and navigation |
| `Breadcrumb` | `{ label: string, path: string }` |
| `BreadcrumbOptions` | Options for `getBreadcrumbs()`: `labels`, `basePath`, `includeCurrent`, `currentLabel` |
| `AdjacentEntries<T>` | `{ prev: TypedCollectionEntry \| undefined, next: TypedCollectionEntry \| undefined }` |
| `TocNode` | `{ depth, text, id, children: TocNode[] }` |
| `CollectionTreeNode` | `{ name, fullName, children: CollectionTreeNode[] }` |
| `EntryUrlOptions` | Options for `getEntryUrl()`: `basePath`, `extension` |
| `RelatedEntriesOptions` | Options for `getRelatedEntries()`: `by`, `limit` |
| `SeriesResult<T>` | Result of `getSeries()`: `name`, `entries`, `currentIndex`, `total`, `prev`, `next` |
| `SeriesOptions` | Options for `getSeries()`: `seriesField`, `orderField` |
| `LocaleOptions` | Options for i18n helpers: `strategy`, `field`, `separator` |

## Development

```bash
bun install          # Install dependencies
bun run build        # Compile TypeScript to dist/
bun test             # Run all unit tests
bun run bench        # Run benchmarks and compare against baseline
bun run bench:save   # Run benchmarks and save as new baseline
bun run lint         # Check linting (Biome)
```

### Benchmarks

The `benchmarks/` directory contains performance benchmarks for key functions (parsing, validation, sorting, etc.). Use `bun run bench:save` to establish a baseline, then `bun run bench` after making changes to detect regressions. The runner exits with code 1 if any benchmark regresses beyond the threshold (default ±10%).

```bash
bun run bench                    # Compare against saved baseline
bun run bench:save               # Save current results as baseline
bun run bench -- --threshold 15  # Custom regression threshold (%)
```

## Requirements

- Node.js >= 18
- Vite >= 7.0.0
- Vike >= 0.4.250
- Zod >= 3.0.0

## License

MIT
