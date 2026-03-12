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

Use `reference()` to create a Zod schema that validates a slug string and marks it as a reference to another collection. After all collections are loaded, the plugin verifies that the referenced slug exists.

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

Override slug generation with a `slug` function in the extended config:

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

The function receives a `SlugInput`:

| Field         | Type                         | Description                       |
| ------------- | ---------------------------- | --------------------------------- |
| `metadata`    | `Record<string, unknown>`    | Validated frontmatter             |
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
| `type`    | `'content' \| 'data'`  | Collection type                     |
| `entries` | `Array`                | Array of serialized entry objects    |

Each entry in the array has `filePath`, `slug`, `metadata`, `content`, `computed`, `lastModified` (ISO string or undefined), and `_isDraft`.

### TypeScript support

To use the virtual module in TypeScript, add a type declaration:

```ts
// src/vite-env.d.ts
declare module 'virtual:content-collection' {
  export const collections: Record<string, {
    type: 'content' | 'data'
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

## Plugin options

All options at a glance:

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

| Option                 | Type      | Default                          | Description                                     |
| ---------------------- | --------- | -------------------------------- | ----------------------------------------------- |
| `contentDir`           | `string`  | `"pages"`                        | Directory to scan for `+Content.ts` files        |
| `contentRoot`          | `string`  | same as `contentDir`             | Directory where content/data files live          |
| `drafts.field`         | `string`  | `"draft"`                        | Metadata field name for draft status             |
| `drafts.includeDrafts` | `boolean` | `true` in dev, `false` in prod   | Force include or exclude draft entries           |
| `lastModified`         | `boolean` | `false`                          | Populate `lastModified` from git history         |
