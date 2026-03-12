# vike-content-collection

A content collection plugin for [Vike](https://vike.dev/) + [Vite](https://vite.dev/) that lets you define typed, schema-validated content collections using [zod](https://zod.dev/).

Define a zod schema in a `+Content.ts` file, and the plugin will parse your markdown frontmatter, validate it against your schema, and make the resulting data available at build time and during development -- both through Vike's `pageContext` and as a virtual module consumable by other Vite plugins. Supports markdown content collections and data-only collections (JSON, YAML, TOML), with built-in rendering, computed fields, draft mode, and more.

## Installation

```bash
npm install vike-content-collection
```

Peer dependencies (install separately if not already present):

```bash
npm install vike vite zod
```

## Setup

### 1. Register the Vite plugin

Add the plugin to your `vite.config.ts`:

```ts
import vikeContentCollection from 'vike-content-collection'

export default {
  plugins: [vikeContentCollection()]
}
```

### 2. Extend the Vike config

In your root (or pages-level) `+config.ts`, extend with the content collection config so Vike recognizes `+Content.ts` files:

```ts
import vikeContentCollectionConfig from 'vike-content-collection/config'

export default {
  extends: [vikeContentCollectionConfig]
}
```

## Usage

### Defining a collection

Create a `+Content.ts` file in any page directory. The simplest form exports `Content` as a zod schema that describes the frontmatter shape:

```ts
// pages/blog/+Content.ts
import { z } from 'zod'

export const Content = z.object({
  title: z.string(),
  date: z.date(),
  tags: z.array(z.string()).optional()
})
```

#### Extended config format

For more control, export `Content` as an object with a `schema` property along with additional options:

```ts
// pages/blog/+Content.ts
import { z } from 'zod'

export const Content = {
  schema: z.object({
    title: z.string(),
    date: z.date(),
    draft: z.boolean().default(false),
    permalink: z.string().optional()
  }),

  // Derive additional data from each entry (see Computed Fields)
  computed: {
    readingTime: ({ content }) => Math.ceil(content.split(/\s+/).length / 200),
    excerpt: ({ content }) => content.slice(0, 200) + '...',
  },

  // Custom slug derivation (see Custom Slugs)
  slug: ({ frontmatter, defaultSlug }) =>
    frontmatter.permalink ?? defaultSlug,
}
```

Both formats are fully supported. If `Content` has a `safeParse` method, it is treated as a plain zod schema. Otherwise, the plugin expects a `schema` property.

The plugin supports named and default exports:

```ts
// Named export (recommended)
export const Content = z.object({ ... })

// Default export with Content property
const Content = z.object({ ... })
export default { Content }

// Direct default export
export default z.object({ ... })
```

### Writing content

Place markdown files in the same directory as `+Content.ts` (or subdirectories), or use the `contentRoot` option to keep them in a separate directory. Frontmatter must match the schema:

```md
---
title: "Getting Started"
date: 2025-03-10T00:00:00.000Z
tags:
  - tutorial
  - beginner
---

This is the body content of the post.
```

By default, the plugin discovers `.md` files in the same directory as the `+Content.ts` config. When `contentRoot` is set, it looks in `contentRoot/<collectionName>/` instead. For example, with `contentRoot: 'content'` and a config at `pages/blog/+Content.ts`, markdown files are loaded from `content/blog/`.

### Data-only collections

For structured data without a markdown body (author profiles, navigation config, product catalogs), set `type: 'data'` in the extended config. The plugin will scan for `.json`, `.yaml`/`.yml`, and `.toml` files instead of `.md`:

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

Each file in the collection directory becomes one entry. The entire file contents are validated against the schema. The `content` field on data entries is an empty string.

### Accessing collection data

#### Via `getCollection()` (recommended)

The plugin exports a typesafe `getCollection()` function. Call it with the collection name (the directory path relative to the content root where `+Content.ts` lives):

```ts
// pages/blog/+data.ts
import { getCollection } from 'vike-content-collection'

export function data() {
  const posts = getCollection('blog')
  // posts is fully typed from the zod schema in +Content.ts
  return { posts }
}
```

Each entry includes:

- `filePath` -- absolute path to the source file.
- `slug` -- unique identifier derived from the filename (or custom slug function).
- `frontmatter` -- validated and typed frontmatter data.
- `content` -- raw markdown body (without frontmatter). Empty string for data entries.
- `computed` -- values produced by computed field functions (empty object if none defined).
- `lastModified` -- git-based last modification date (`Date | undefined`, opt-in).
- `_isDraft` -- whether the entry is marked as a draft.
- `index` -- a lookup map of all sibling entries in the same collection, keyed by slug.

The collection name is derived from the directory structure:

| `+Content.ts` location             | Collection name          |
| ----------------------------------- | ------------------------ |
| `pages/blog/+Content.ts`           | `"blog"`                 |
| `pages/docs/guides/+Content.ts`    | `"docs/guides"`          |

#### Via `getCollectionEntry()`

Use `getCollectionEntry()` to retrieve specific entries from a collection. The second argument accepts several filter types:

**By slug** -- pass a string to look up a single entry. Returns the entry or `undefined`:

```ts
import { getCollectionEntry } from 'vike-content-collection'

const post = getCollectionEntry('blog', 'getting-started')
// TypedCollectionEntry | undefined
```

**By regex** -- pass a `RegExp` to match slugs. Returns an array of matching entries:

```ts
const tutorials = getCollectionEntry('blog', /^tutorial-/)
// TypedCollectionEntry[]
```

**By predicate** -- pass a function to filter entries. Returns an array of matching entries:

```ts
const published = getCollectionEntry('blog', (entry) => !entry._isDraft)
// TypedCollectionEntry[]
```

**By array** -- pass an array of any of the above (OR semantics). Returns an array of entries matching any filter:

```ts
const selected = getCollectionEntry('blog', [
  'intro',
  /^tutorial-/,
  (entry) => entry.frontmatter.featured === true,
])
// TypedCollectionEntry[]
```

### Rendering markdown

The plugin includes a built-in rendering pipeline powered by [unified](https://unifiedjs.com/) / remark / rehype. Use `renderEntry()` to convert an entry's markdown content to HTML:

```ts
import { getCollectionEntry, renderEntry } from 'vike-content-collection'

const post = getCollectionEntry('blog', 'getting-started')
if (post) {
  const { html, headings } = await renderEntry(post)
  // html: rendered HTML string
  // headings: [{ depth: 2, text: 'Installation', id: 'installation' }, ...]
}
```

Headings are automatically extracted during rendering and returned alongside the HTML. Each heading includes a `depth` (1-6), `text` content, and a generated `id` for anchor links. The rendered HTML includes matching `id` attributes on heading elements via `rehype-slug`.

#### Custom remark/rehype plugins

Pass custom remark or rehype plugins to extend the rendering pipeline:

```ts
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

const { html } = await renderEntry(post, {
  remarkPlugins: [remarkGfm],
  rehypePlugins: [rehypeHighlight],
})
```

### Extracting headings (without rendering)

To extract headings without a full HTML render, use `extractHeadings()`:

```ts
import { extractHeadings } from 'vike-content-collection'

const headings = await extractHeadings(post.content)
// [{ depth: 1, text: 'Title', id: 'title' }, { depth: 2, text: 'Section', id: 'section' }]
```

This parses the markdown AST just enough to find heading nodes, which is faster than a full render when you only need a table of contents.

### Computed fields

Define functions in the extended config that derive additional data from each entry. Computed fields run after frontmatter validation and are available on the `computed` property:

```ts
// pages/blog/+Content.ts
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
posts.forEach(post => {
  console.log(post.computed.readingTime) // number
  console.log(post.computed.excerpt)     // string
})
```

Each computed function receives `{ frontmatter, content, filePath, slug }`.

### Collection references

Use `reference()` to create a zod schema that validates a slug string and marks it as a reference to another collection. After all collections are loaded, the plugin verifies that the referenced slugs exist:

```ts
// pages/posts/+Content.ts
import { z } from 'zod'
import { reference } from 'vike-content-collection'

export const Content = z.object({
  title: z.string(),
  author: reference('authors'),  // validates that this slug exists in the "authors" collection
})
```

At validation time, `reference()` accepts any string. After all collections are processed, the plugin runs a cross-collection validation pass and warns about any broken references.

### Custom slugs

By default, slugs are derived from the filename (minus the extension). To customize slug generation, provide a `slug` function in the extended config:

```ts
export const Content = {
  schema: z.object({
    title: z.string(),
    permalink: z.string().optional()
  }),
  slug: ({ frontmatter, filePath, defaultSlug }) =>
    frontmatter.permalink ?? defaultSlug,
}
```

The slug function receives `{ frontmatter, filePath, defaultSlug }` where `defaultSlug` is the filename-based slug that would have been used.

### Draft mode

Entries with a truthy `draft` field in their frontmatter are automatically filtered out in production builds while remaining visible during development. No schema changes are required -- the plugin checks the frontmatter field directly after validation.

In development, draft entries are included with `_isDraft: true` so you can style or badge them differently. In production (`vite build`), drafts are excluded entirely.

Configure the draft field name or override the include behavior via plugin options:

```ts
vikeContentCollection({
  drafts: {
    field: 'draft',         // frontmatter field to check (default: "draft")
    includeDrafts: false,   // force exclude even in dev (default: true in dev, false in prod)
  }
})
```

### Sorting and pagination

The plugin exports helper functions for common collection operations:

#### `sortCollection()`

Sort entries by a frontmatter key. Returns a new array without mutating the original:

```ts
import { getCollection, sortCollection } from 'vike-content-collection'

const posts = getCollection('blog')
const byDate = sortCollection(posts, 'date', 'desc')   // newest first
const byTitle = sortCollection(posts, 'title', 'asc')  // alphabetical
```

Supports dates, numbers, and strings. Defaults to ascending order.

#### `paginate()`

Split entries into pages:

```ts
import { getCollection, paginate } from 'vike-content-collection'

const posts = getCollection('blog')
const page = paginate(posts, { pageSize: 10, currentPage: 2 })

page.items          // entries for this page
page.currentPage    // 2
page.totalPages     // total number of pages
page.totalItems     // total number of entries
page.hasNextPage    // boolean
page.hasPreviousPage // boolean
```

The current page is clamped to valid bounds automatically.

### Git-based last modified date

Opt-in feature that populates the `lastModified` field on each entry using `git log`. Enable it in the plugin options:

```ts
vikeContentCollection({
  lastModified: true,
})
```

Each entry will have `lastModified` set to a `Date` representing the last git commit that touched the file, or `undefined` if git is not available or the file is untracked.

```ts
const posts = getCollection('blog')
posts.forEach(post => {
  if (post.lastModified) {
    console.log(`Last updated: ${post.lastModified.toISOString()}`)
  }
})
```

### Type generation

The plugin automatically generates a `.vike-content-collection/types.d.ts` declaration file that maps each collection name to its inferred zod schema type. To enable type inference, add the generated directory to your `tsconfig.json`:

```json
{
  "include": [
    "src",
    ".vike-content-collection/**/*"
  ]
}
```

The declaration file is regenerated on every build and during HMR in development. It supports both the plain zod schema format and the extended `{ schema: ... }` format, so `getCollection()` returns fully typed entries without any manual type annotations.

### Via the virtual module

Other Vite plugins or application code can also import collection data through the virtual module:

```ts
import { collections } from 'virtual:content-collection'
```

The `collections` object is a record keyed by the directory path of each `+Content.ts`, with each value containing a `type` (`"content"` or `"data"`) and an `entries` array of `{ filePath, slug, frontmatter, content, computed, lastModified, _isDraft }`.

### Via Vike's pageContext

Because `Content` is registered as a Vike setting through the `meta` system, the schema is available on `pageContext.config.Content` in server-side hooks like `+data.ts`.

## Schema Validation Errors

When a file's frontmatter or data fails validation, the build halts with a detailed error that includes:

- The file path of the offending file
- The line number within the frontmatter where the issue was found (for markdown files)
- The zod error path (e.g. `metadata.name`)
- The validation message

Example output:

```
ContentCollectionValidationError: [vike-content-collection] Schema validation failed:
  pages/blog/post.md:4 (at "metadata.name"): Expected string, received number
```

This applies during both `vite build` and `vite dev` -- the dev server will surface the same errors on file changes via HMR.

## Plugin Options

The plugin factory accepts an optional configuration object:

```ts
vikeContentCollection({
  contentDir: 'pages',        // where +Content.ts files are scanned (default: "pages")
  contentRoot: 'content',     // where content files live (default: same as contentDir)
  drafts: {
    field: 'draft',           // frontmatter field for draft status (default: "draft")
    includeDrafts: true,      // force include/exclude drafts (default: true in dev, false in prod)
  },
  lastModified: true,         // populate lastModified from git (default: false)
})
```

| Option                  | Type      | Default              | Description                                                                  |
| ----------------------- | --------- | -------------------- | ---------------------------------------------------------------------------- |
| `contentDir`            | `string`  | `"pages"`            | Root directory to scan for `+Content.ts` config files.                       |
| `contentRoot`           | `string`  | same as `contentDir` | Root directory where content/data files live.                                |
| `drafts.field`          | `string`  | `"draft"`            | Frontmatter field name to check for draft status.                            |
| `drafts.includeDrafts`  | `boolean` | `true` in dev, `false` in prod | Force include/exclude draft entries.                          |
| `lastModified`          | `boolean` | `false`              | Populate `lastModified` from git history on each entry.                      |

## How It Works

1. **Scan** -- On `buildStart`, the plugin recursively searches `contentDir` for `+Content.ts` files. Each must export a zod schema (directly or via `{ schema: ... }`).
2. **Parse** -- For content collections, it collects `.md` files and parses YAML frontmatter using [gray-matter](https://github.com/jonschlinkert/gray-matter). For data collections, it collects `.json`, `.yaml`/`.yml`, and `.toml` files.
3. **Validate** -- Each parsed frontmatter/data object is validated against the zod schema. On failure, zod error paths are mapped back to specific line numbers in the source file.
4. **Compute** -- Computed field functions run on each validated entry, producing derived data.
5. **Filter** -- Draft entries are excluded in production builds.
6. **Store** -- Validated entries are held in an in-memory store, keyed by collection name.
7. **References** -- A cross-collection validation pass verifies that all `reference()` fields point to existing slugs.
8. **Generate types** -- A `.vike-content-collection/types.d.ts` declaration file is emitted, powering the typesafe `getCollection()` function.
9. **Serve** -- A virtual module (`virtual:content-collection`) exposes the serialized collection data.
10. **HMR** -- During development, file changes trigger incremental re-processing of only the changed file (not the entire collection), followed by type regeneration and virtual module invalidation.

## Exported API

### Functions

```ts
import {
  vikeContentCollectionPlugin,  // Vite plugin factory
  getCollection,                // retrieve all entries of a collection
  getCollectionEntry,           // retrieve specific entries by filter
  renderEntry,                  // render markdown to HTML
  extractHeadings,              // extract headings from markdown
  sortCollection,               // sort entries by a frontmatter key
  paginate,                     // paginate an array of entries
  reference,                    // create a cross-collection reference schema
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
  CollectionEntry,
  Collection,
  CollectionMap,
  TypedCollectionEntry,
  CollectionEntryFilter,
  CollectionEntryFilterInput,
  CollectionEntryPredicate,
  ParsedMarkdown,
  FrontmatterLineMap,
  ValidationIssue,
  RenderResult,
  RenderOptions,
  Heading,
  PaginationResult,
} from 'vike-content-collection'
```

| Type                             | Description                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `ContentCollectionPluginOptions` | Options accepted by the `vikeContentCollection()` factory.                         |
| `ContentCollectionConfig`        | Shape of the `+Content.ts` export (`{ Content: ZodSchema }`).                      |
| `ContentCollectionDefinition`    | Extended config object with `schema`, `computed`, `slug`, and `type` fields.       |
| `ResolvedContentConfig`          | Normalized config after resolving a plain schema or definition object.             |
| `ComputedFieldInput`             | Input passed to computed field functions (`frontmatter`, `content`, `filePath`, `slug`). |
| `SlugInput`                      | Input passed to custom slug functions (`frontmatter`, `filePath`, `defaultSlug`).  |
| `CollectionEntry`                | A single validated entry (slug, frontmatter, content, computed, file path, index). |
| `Collection`                     | A full collection (name, type, config path, directory, array of entries).          |
| `CollectionMap`                  | Augmentable interface mapping collection names to frontmatter types.               |
| `TypedCollectionEntry<T>`        | A collection entry with typed frontmatter and all metadata fields.                 |
| `CollectionEntryPredicate<T>`    | Predicate function used to filter collection entries.                              |
| `CollectionEntryFilter<T>`       | A single filter criterion: `string`, `RegExp`, or `CollectionEntryPredicate<T>`.   |
| `CollectionEntryFilterInput<T>`  | One or more filter criteria (single or array), accepted by `getCollectionEntry()`. |
| `ParsedMarkdown`                 | Result of parsing a markdown file (frontmatter, content, line map).                |
| `FrontmatterLineMap`             | Maps frontmatter key paths to their 1-based line numbers.                          |
| `ValidationIssue`                | A single validation error with file, line, path, and message.                      |
| `RenderResult`                   | Result of `renderEntry()`: `{ html: string, headings: Heading[] }`.               |
| `RenderOptions`                  | Options for `renderEntry()`: custom `remarkPlugins` and `rehypePlugins`.           |
| `Heading`                        | A single heading: `{ depth: number, text: string, id: string }`.                  |
| `PaginationResult<T>`            | Result of `paginate()` with `items`, page info, and navigation booleans.           |

## Requirements

- Node.js >= 18
- Vite >= 7.0.0
- Vike >= 0.4.250
- Zod >= 3.0.0

## License

MIT
