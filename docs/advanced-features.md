# Advanced Features

This guide covers the plugin's advanced capabilities: computed fields, collection references, custom slugs, draft mode, sorting, pagination, git integration, custom renderers, and the virtual module.

## Computed fields

Derive additional data from each entry. Computed functions run after schema validation and are available on the `computed` property of every entry.

### Defining computed fields

Use the extended config format and add a `computed` object:

```ts
// pages/blog/+Content.ts
import { z } from 'zod'

export const Content = {
  schema: z.object({
    title: z.string(),
    date: z.date()
  }),
  computed: {
    readingTime: ({ content }) => Math.ceil(content.split(/\s+/).length / 200),
    wordCount: ({ content }) => content.split(/\s+/).length,
    excerpt: ({ content }) => content.slice(0, 160).trim() + '...',
  }
}
```

Each function receives a `ComputedFieldInput`:

| Field      | Type                         | Description              |
| ---------- | ---------------------------- | ------------------------ |
| `metadata` | `Record<string, unknown>`    | Validated frontmatter    |
| `content`  | `string`                     | Raw markdown body        |
| `filePath` | `string`                     | Absolute path to file    |
| `slug`     | `string`                     | Entry slug               |

### Accessing computed values

```ts
import { getCollection } from 'vike-content-collection'

const posts = getCollection('blog')
for (const post of posts) {
  console.log(`${post.metadata.title} - ${post.computed.readingTime} min read`)
}
```

## Collection references

Use `reference()` to create a Zod schema that validates a slug string and marks it as a reference to another collection. After all collections are loaded, the plugin verifies that the referenced slug exists. The `collectionName` argument is typed as `CollectionName`, which autocompletes to known collection names when the generated declaration file is present.

### Defining a reference

```ts
// pages/posts/+Content.ts
import { z } from 'zod'
import { reference } from 'vike-content-collection'

export const Content = z.object({
  title: z.string(),
  author: reference('authors'),
})
```

The `author` field accepts any string during initial validation. After all collections are processed, the plugin runs a cross-collection pass and warns if a slug doesn't exist in the `"authors"` collection.

### Using referenced data

References are stored as slug strings. To resolve them, query the referenced collection:

```ts
import { getCollectionEntry } from 'vike-content-collection'

const post = getCollectionEntry('blog', 'my-post')
if (post) {
  const author = getCollectionEntry('authors', post.metadata.author)
  console.log(author?.metadata.name)
}
```

### Example: blog with authors

```ts
// pages/authors/+Content.ts
export const Content = {
  type: 'data',
  schema: z.object({
    name: z.string(),
    bio: z.string()
  })
}
```

```yaml
# pages/authors/jane.yaml
name: Jane Doe
bio: Writer and developer
```

```ts
// pages/blog/+Content.ts
import { reference } from 'vike-content-collection'

export const Content = z.object({
  title: z.string(),
  author: reference('authors'),
})
```

```md
<!-- pages/blog/my-post.md -->
---
title: "My Post"
author: "jane"
---

Content here.
```

If the frontmatter says `author: "nonexistent"`, the plugin warns that the slug doesn't exist in the `"authors"` collection.

## Custom slugs

By default, slugs are derived from the filename without extension (e.g. `hello-world.md` becomes `"hello-world"`).

Override slug generation with a `slug` function in the extended config. Use `defineCollection()` to get typed `metadata` based on your schema:

```ts
import { defineCollection } from 'vike-content-collection'

export const Content = defineCollection({
  schema: z.object({
    title: z.string(),
    permalink: z.string().optional()
  }),
  slug: ({ metadata, filePath, defaultSlug }) =>
    metadata.permalink ?? defaultSlug, // ← metadata.permalink is typed as string | undefined
})
```

The function receives a `SlugInput<TMetadata>`:

| Field         | Type                         | Description                       |
| ------------- | ---------------------------- | --------------------------------- |
| `metadata`    | Inferred from schema (via `defineCollection`) | Validated frontmatter |
| `filePath`    | `string`                     | Absolute path to the file         |
| `defaultSlug` | `string`                     | Filename-based slug               |

## Draft mode

Entries with a truthy `draft` field in their metadata are automatically handled:

- **Development** -- drafts are included with `_isDraft: true`
- **Production** (`vite build`) -- drafts are excluded entirely

No schema changes are required. The plugin checks the metadata field directly after validation.

### Styling drafts in development

```tsx
const posts = getCollection('blog')

posts.map(post => (
  <article key={post.slug} style={{ opacity: post._isDraft ? 0.5 : 1 }}>
    {post._isDraft && <span>[DRAFT]</span>}
    <h2>{post.metadata.title}</h2>
  </article>
))
```

### Configuration

```ts
vikeContentCollection({
  drafts: {
    field: 'draft',         // metadata field to check (default: "draft")
    includeDrafts: false,   // force exclude even in dev (default: true in dev, false in prod)
  }
})
```

| Option          | Type      | Default                          | Description                      |
| --------------- | --------- | -------------------------------- | -------------------------------- |
| `field`         | `string`  | `"draft"`                        | Metadata field name              |
| `includeDrafts` | `boolean` | `true` in dev, `false` in prod   | Force include or exclude drafts  |

## Sorting

### `sortCollection(entries, key, order?)`

Sort entries by a metadata key. Returns a new array without mutating the original:

```ts
import { getCollection, sortCollection } from 'vike-content-collection'

const posts = getCollection('blog')
const byDate = sortCollection(posts, 'date', 'desc')   // newest first
const byTitle = sortCollection(posts, 'title', 'asc')  // alphabetical
```

- Supports `Date`, `number`, and `string` values
- Defaults to `'asc'` (ascending) order
- Returns a new array; the original is not modified

## Pagination

### `paginate(entries, options)`

Split an array of entries into pages:

```ts
import { getCollection, sortCollection, paginate } from 'vike-content-collection'

const posts = getCollection('blog')
const sorted = sortCollection(posts, 'date', 'desc')
const page = paginate(sorted, { pageSize: 10, currentPage: 2 })
```

### `PaginationResult`

| Field             | Type                      | Description                     |
| ----------------- | ------------------------- | ------------------------------- |
| `items`           | `TypedCollectionEntry[]`  | Entries for the current page    |
| `currentPage`     | `number`                  | Current page number             |
| `totalPages`      | `number`                  | Total number of pages           |
| `totalItems`      | `number`                  | Total number of entries         |
| `hasNextPage`     | `boolean`                 | Whether a next page exists      |
| `hasPreviousPage` | `boolean`                 | Whether a previous page exists  |

The `currentPage` is automatically clamped to valid bounds (1 to `totalPages`).

### Pagination with Vike routing

```ts
// pages/blog/@page/+data.ts
import { getCollection, sortCollection, paginate } from 'vike-content-collection'
import type { PageContext } from 'vike/types'

export function data(pageContext: PageContext) {
  const posts = getCollection('blog')
  const sorted = sortCollection(posts, 'date', 'desc')
  const page = paginate(sorted, {
    pageSize: 10,
    currentPage: Number(pageContext.routeParams.page) || 1
  })
  return { page }
}
```

```tsx
// pages/blog/@page/+Page.tsx
import { useData } from 'vike-renderer/useData'

export function Page() {
  const { page } = useData()

  return (
    <div>
      {page.items.map(post => (
        <article key={post.slug}>
          <h2>{post.metadata.title}</h2>
        </article>
      ))}

      <nav>
        {page.hasPreviousPage && <a href={`/blog/${page.currentPage - 1}`}>Previous</a>}
        <span>Page {page.currentPage} of {page.totalPages}</span>
        {page.hasNextPage && <a href={`/blog/${page.currentPage + 1}`}>Next</a>}
      </nav>
    </div>
  )
}
```

## Git last modified

Populate the `lastModified` field on each entry using `git log`. This gives you the date of the last commit that touched each file.

### Enable it

```ts
vikeContentCollection({ lastModified: true })
```

### Use it

```ts
const posts = getCollection('blog')
for (const post of posts) {
  if (post.lastModified) {
    console.log(`${post.metadata.title} -- updated ${post.lastModified.toLocaleDateString()}`)
  }
}
```

`lastModified` is `undefined` if git is unavailable or the file is untracked (e.g. newly created and not yet committed).

## Custom content renderers

The plugin ships with built-in markdown and MDX renderers, but you can implement the `ContentRenderer` interface for full control over how content is rendered.

### The `ContentRenderer` interface

```ts
import type { ContentRenderer, RenderResult } from 'vike-content-collection'

const myRenderer: ContentRenderer = {
  async render(content, options): Promise<RenderResult> {
    // content: raw markdown/MDX body string
    // options: { remarkPlugins?, rehypePlugins? } from renderEntry() call
    return {
      html: '<p>Your rendered HTML</p>',
      headings: [{ depth: 1, text: 'Title', id: 'title' }]
    }
  }
}
```

### Using a custom renderer

Pass it to `renderEntry()` via the `renderer` option:

```ts
import { renderEntry } from 'vike-content-collection'

const { html, headings } = await renderEntry(post, { renderer: myRenderer })
```

### Built-in renderer factories

The plugin exports two renderer factories. Both accept default plugins:

```ts
import { createMarkdownRenderer, createMdxRenderer } from 'vike-content-collection'

const mdRenderer = createMarkdownRenderer({ remarkPlugins: [remarkGfm] })
const mdxRenderer = createMdxRenderer({ remarkPlugins: [remarkGfm] })
```

When no `renderer` is specified in `renderEntry()`, the built-in markdown renderer is used.

See [Rendering Content](./rendering.md) for more detail on MDX rendering and the full rendering pipeline.

## Virtual module

The plugin exposes all collection data through a Vite virtual module. This is useful for other Vite plugins or when you need raw access to the collection store.

```ts
import { collections } from 'virtual:content-collection'
```

`collections` is a record keyed by the directory path of each `+Content.ts`. Each value contains:

| Field     | Type                   | Description                          |
| --------- | ---------------------- | ------------------------------------ |
| `type`    | `'content' \| 'data' \| 'both'` | Collection type              |
| `entries` | `Array`                | Array of serialized entry objects    |

Each entry in the array has `filePath`, `slug`, `metadata`, `content`, `computed`, `lastModified` (ISO string or undefined), and `_isDraft`.

### TypeScript support

> For full details on TypeScript configuration, including the auto-generated declaration file and troubleshooting, see the [TypeScript Setup](./typescript-setup.md) guide.

To use the virtual module in TypeScript, add a type declaration:

```ts
// src/vite-env.d.ts
declare module 'virtual:content-collection' {
  export const collections: Record<string, {
    type: 'content' | 'data' | 'both'
    entries: Array<{
      filePath: string
      slug: string
      metadata: Record<string, unknown>
      content: string
      computed: Record<string, unknown>
      lastModified: string | undefined
      _isDraft: boolean
    }>
  }>
}
```

## Breadcrumbs

Generate breadcrumb navigation trails from collection names and entry slugs. Collection names already encode hierarchy (`"docs/guides"` splits into two segments), so breadcrumbs are derived automatically.

### `getBreadcrumbs(collectionName, slug?, options?)`

```ts
import { getBreadcrumbs } from 'vike-content-collection'

const crumbs = getBreadcrumbs('docs/guides', 'getting-started')
// [
//   { label: 'Docs', path: '/docs' },
//   { label: 'Guides', path: '/docs/guides' },
//   { label: 'Getting Started', path: '/docs/guides/getting-started' },
// ]
```

### Options

| Option           | Type                       | Default  | Description                                        |
| ---------------- | -------------------------- | -------- | -------------------------------------------------- |
| `labels`         | `Record<string, string>`   | `{}`     | Map path segments to display labels                |
| `basePath`       | `string`                   | `"/"`    | Prefix prepended to all breadcrumb paths            |
| `includeCurrent` | `boolean`                  | `true`   | Include the entry as the last breadcrumb            |
| `currentLabel`   | `string`                   | —        | Override label for the current entry crumb          |

### Custom labels and base path

```ts
const crumbs = getBreadcrumbs('docs/guides', 'setup', {
  labels: { docs: 'Documentation', guides: 'User Guides' },
  basePath: '/en',
})
// [
//   { label: 'Documentation', path: '/en/docs' },
//   { label: 'User Guides', path: '/en/docs/guides' },
//   { label: 'Setup', path: '/en/docs/guides/setup' },
// ]
```

### Breadcrumbs without the current entry

```ts
const crumbs = getBreadcrumbs('docs/guides', 'setup', {
  includeCurrent: false,
})
// [
//   { label: 'Docs', path: '/docs' },
//   { label: 'Guides', path: '/docs/guides' },
// ]
```

## Next/previous navigation

### `getAdjacentEntries(name, currentSlug, options?)`

Find the previous and next entries relative to a given slug in a collection. Useful for "Previous" / "Next" links in blogs and documentation.

```ts
import { getAdjacentEntries } from 'vike-content-collection'

const { prev, next } = getAdjacentEntries('blog', 'my-post', {
  sortBy: 'date',
  order: 'desc',
})
```

| Option   | Type              | Default | Description                          |
| -------- | ----------------- | ------- | ------------------------------------ |
| `sortBy` | `string`          | —       | Metadata key to sort by before lookup |
| `order`  | `'asc' \| 'desc'` | `'asc'` | Sort direction                        |

Both `prev` and `next` are `TypedCollectionEntry | undefined`. If the slug is not found, both are `undefined`.

### Usage in a page

```ts
// pages/blog/@slug/+data.ts
import { getAdjacentEntries, getCollectionEntry } from 'vike-content-collection'
import type { PageContext } from 'vike/types'

export function data(pageContext: PageContext) {
  const slug = pageContext.routeParams.slug
  const post = getCollectionEntry('blog', slug)
  const { prev, next } = getAdjacentEntries('blog', slug, {
    sortBy: 'date',
    order: 'desc',
  })
  return { post, prev, next }
}
```

## Grouping

### `groupBy(entries, key)`

Group entries by a metadata key. Returns a `Map<string, TypedCollectionEntry[]>`. If the metadata value is an array (e.g. tags), the entry appears in a group for each element.

```ts
import { getCollection, groupBy } from 'vike-content-collection'

const posts = getCollection('blog')
const byTag = groupBy(posts, 'tags')
// Map { 'javascript' => [...], 'react' => [...], 'python' => [...] }

const byCategory = groupBy(posts, 'category')
// Map { 'tutorial' => [...], 'guide' => [...] }
```

Entries where the key is `undefined` or `null` are skipped.

## Table of contents tree

### `buildTocTree(headings)`

Convert a flat array of headings (from `extractHeadings` or `renderEntry`) into a nested tree structure. Each node has a `children` array for deeper headings.

```ts
import { extractHeadings, buildTocTree } from 'vike-content-collection'

const headings = await extractHeadings(post.content)
const tree = buildTocTree(headings)
```

### `TocNode`

| Field      | Type        | Description            |
| ---------- | ----------- | ---------------------- |
| `depth`    | `number`    | Heading level (1–6)    |
| `text`     | `string`    | Heading text           |
| `id`       | `string`    | Slug ID for linking    |
| `children` | `TocNode[]` | Nested child headings  |

### Example output

For headings `[H2, H3, H3, H2]`, `buildTocTree` returns:

```ts
[
  { depth: 2, text: 'Section A', id: 'section-a', children: [
    { depth: 3, text: 'Sub 1', id: 'sub-1', children: [] },
    { depth: 3, text: 'Sub 2', id: 'sub-2', children: [] },
  ]},
  { depth: 2, text: 'Section B', id: 'section-b', children: [] },
]
```

## Collection entry tree

### `getCollectionTree(name)`

Returns the entries of a collection organised as a hierarchical tree based on slug paths. Useful for generating sidebars, site maps, or nested navigation from collections whose entries use path-based slugs (e.g. `"guides/installation"`).

```ts
import { getCollectionTree } from 'vike-content-collection'

const tree = getCollectionTree('docs')
```

### `TypedTreeNode<TMetadata, TComputed>`

The return type is `TypedTreeNode[]`, a discriminated union of two node types with typed entry data (metadata and computed fields are inferred from `CollectionMap` when available):

**`TypedEntryNode`** — a leaf node carrying a typed entry.

| Field      | Type                   | Description                        |
| ---------- | ---------------------- | ---------------------------------- |
| `name`     | `string`               | Segment name (e.g. `"intro"`)      |
| `fullName` | `string`               | Full entry slug                    |
| `entry`    | `TypedCollectionEntry` | The typed collection entry         |

**`TypedFolderNode`** — a directory node containing children.

| Field      | Type               | Description                                                              |
| ---------- | ------------------ | ------------------------------------------------------------------------ |
| `name`     | `string`           | Segment name (e.g. `"guides"`)                                           |
| `fullName` | `string`           | Full entry slug if this folder is also an entry, otherwise `""`          |
| `children` | `TypedTreeNode[]`  | Child nodes                                                               |

You can distinguish them with `"children" in node` (folder) or `"entry" in node` (leaf).

### Example

Given a `"docs"` collection with entries `"intro"`, `"guides/installation"`, `"guides/configuration"`, and `"api/overview"`:

```ts
[
  { name: 'intro', fullName: 'intro', entry: { slug: 'intro', ... } },
  {
    name: 'guides', fullName: '', children: [
      { name: 'installation', fullName: 'guides/installation', entry: { slug: 'guides/installation', ... } },
      { name: 'configuration', fullName: 'guides/configuration', entry: { slug: 'guides/configuration', ... } },
    ]
  },
  {
    name: 'api', fullName: '', children: [
      { name: 'overview', fullName: 'api/overview', entry: { slug: 'api/overview', ... } },
    ]
  },
]
```

If an entry exists at a path that also has children (e.g. slug `"guides"` alongside `"guides/installation"`), the path becomes a `FolderNode` with `fullName` set to the slug.

## Related entries

### `getRelatedEntries(name, currentSlug, options)`

Find entries related to a given entry by scoring shared metadata values. Useful for "Related posts" sections on blogs and knowledge bases.

```ts
import { getRelatedEntries } from 'vike-content-collection'

const related = getRelatedEntries('blog', 'my-post', {
  by: ['tags', 'category'],
  limit: 3,
})
```

| Option  | Type       | Default | Description                                    |
| ------- | ---------- | ------- | ---------------------------------------------- |
| `by`    | `string[]` | —       | Metadata fields to compare for overlap          |
| `limit` | `number`   | `5`     | Maximum number of related entries to return     |

For array fields like `tags`, each shared element counts as one point of overlap. Entries are sorted by score descending; entries with zero overlap are excluded.

## Merge collections

### `mergeCollections(names)`

Combine entries from multiple collections into a single array. Useful for aggregated views like "latest updates" or site-wide search results.

```ts
import { mergeCollections, sortCollection } from 'vike-content-collection'

const all = mergeCollections(['blog', 'news', 'changelog'])
const latest = sortCollection(all, 'date', 'desc').slice(0, 10)
```

The metadata type of the result is `Record<string, unknown>` since schemas may differ across collections.

## Unique values

### `uniqueValues(entries, key)`

Extract all unique values for a metadata key. Array-valued fields are flattened. Returns a sorted, deduplicated array of strings.

```ts
import { getCollection, uniqueValues } from 'vike-content-collection'

const posts = getCollection('blog')
const allTags = uniqueValues(posts, 'tags')
// ['javascript', 'python', 'react', 'vue']
```

## Entry URL

### `getEntryUrl(collectionName, slug, options?)`

Generate a URL path for a collection entry. Complements `getBreadcrumbs` for link generation.

```ts
import { getEntryUrl } from 'vike-content-collection'

const url = getEntryUrl('docs/guides', 'getting-started')
// '/docs/guides/getting-started'

const url = getEntryUrl('blog', 'my-post', {
  basePath: '/en',
  extension: '.html',
})
// '/en/blog/my-post.html'
```

| Option      | Type     | Default | Description                          |
| ----------- | -------- | ------- | ------------------------------------ |
| `basePath`  | `string` | `"/"`   | Prefix prepended to the URL          |
| `extension` | `string` | `""`    | File extension appended to the slug  |

## Content series

### `getSeries(name, currentSlug, seriesName, options?)`

Get an ordered series of entries that share a common series identifier. Entries declare membership via metadata fields (e.g. `series: "react-tutorial"` and `seriesOrder: 2`).

```ts
import { getSeries } from 'vike-content-collection'

const series = getSeries('blog', 'part-2', 'react-tutorial')
if (series) {
  console.log(`Part ${series.currentIndex + 1} of ${series.total}`)
  // series.prev, series.next for navigation
}
```

### `SeriesResult`

| Field          | Type                            | Description                             |
| -------------- | ------------------------------- | --------------------------------------- |
| `name`         | `string`                        | Series identifier                        |
| `entries`      | `TypedCollectionEntry[]`        | All entries in order                     |
| `currentIndex` | `number`                        | Zero-based index of current entry        |
| `total`        | `number`                        | Total entries in the series              |
| `prev`         | `TypedCollectionEntry \| undefined` | Previous entry, or `undefined`       |
| `next`         | `TypedCollectionEntry \| undefined` | Next entry, or `undefined`           |

### `SeriesOptions`

| Option        | Type     | Default         | Description                          |
| ------------- | -------- | --------------- | ------------------------------------ |
| `seriesField` | `string` | `"series"`      | Metadata field for series name       |
| `orderField`  | `string` | `"seriesOrder"` | Metadata field for sort order        |

Returns `undefined` if no entries match the series or the slug is not found within it.

## i18n locale helpers

Helpers for multilingual content. Supports two locale detection strategies:

- **suffix** (default): locale is part of the slug (e.g. `getting-started.fr`)
- **metadata**: locale is stored in a metadata field (e.g. `locale: "fr"`)

### `getAvailableLocales(name, baseSlug, options?)`

Get all available locales for a given base slug.

```ts
import { getAvailableLocales } from 'vike-content-collection'

const locales = getAvailableLocales('docs', 'getting-started')
// ['', 'de', 'fr']  ('' = default locale / base slug)
```

### `getLocalizedEntry(name, baseSlug, locale, options?)`

Get a specific localized version of an entry.

```ts
import { getLocalizedEntry } from 'vike-content-collection'

const frEntry = getLocalizedEntry('docs', 'getting-started', 'fr')
const defaultEntry = getLocalizedEntry('docs', 'getting-started', '')
```

### `LocaleOptions`

| Option      | Type                       | Default    | Description                              |
| ----------- | -------------------------- | ---------- | ---------------------------------------- |
| `strategy`  | `"suffix" \| "metadata"`   | `"suffix"` | How to detect locales                    |
| `field`     | `string`                   | `"locale"` | Metadata field (metadata strategy only)  |
| `separator` | `string`                   | `"."`      | Separator between slug and locale        |

## Server-only execution

The plugin's runtime APIs (`getCollection`, `getCollectionEntry`, `findCollectionEntries`, `renderEntry`, etc.) use Node.js-specific code that should not run in the browser. The plugin handles this automatically: when `vike-content-collection` is imported in a client-side bundle, the plugin intercepts the import and replaces it with a lightweight no-op module that exports safe stubs.

This means:

- `getCollection()` returns `[]` on the client
- `getCollectionEntry()` returns `undefined` on the client
- `findCollectionEntries()` returns `[]` on the client
- `renderEntry()` returns `{ html: '', headings: [] }` on the client
- All other runtime functions return safe empty values

No additional configuration is needed. This works out of the box as long as the Vite plugin is registered. Use `+data.ts` files (which run on the server) to call the runtime APIs and pass data to your page components.

## Plugin options

All options at a glance:

```ts
vikeContentCollection({
  contentDir: 'pages',
  contentRoot: 'content',
  declarationOutDir: '.vike-content-collection',
  declarationFileName: 'types.d.ts',
  drafts: {
    field: 'draft',
    includeDrafts: true,
  },
  lastModified: true,
})
```

| Option                 | Type      | Default                          | Description                                     |
| ---------------------- | --------- | -------------------------------- | ----------------------------------------------- |
| `contentDir`           | `string`  | `"pages"`                        | Directory to scan for `+Content.ts` files        |
| `contentRoot`          | `string`  | same as `contentDir`             | Directory where content/data files live          |
| `declarationOutDir`    | `string`  | `".vike-content-collection"`     | Output directory for the generated declaration file |
| `declarationFileName`  | `string`  | `"types.d.ts"`                   | Filename for the generated declaration file         |
| `drafts.field`         | `string`  | `"draft"`                        | Metadata field name for draft status             |
| `drafts.includeDrafts` | `boolean` | `true` in dev, `false` in prod   | Force include or exclude draft entries           |
| `lastModified`         | `boolean` | `false`                          | Populate `lastModified` from git history         |
