# Querying Data

Once you've [defined collections](./defining-collections.md) and added content, use `getCollection()`, `getCollectionEntry()`, and `findCollectionEntries()` to access your data. All functions are fully typed when the generated declaration file is included in your `tsconfig.json`.

## `getCollection(name)`

Returns all entries in a collection as a typed array:

```ts
import { getCollection } from 'vike-content-collection'

const posts = getCollection('blog')
// TypedCollectionEntry<{ title: string; date: Date; tags?: string[] }>[]
```

If the collection doesn't exist, an error is thrown listing the available collection names.

### Typical usage in a `+data.ts` file

```ts
// pages/blog/+data.ts
import { getCollection } from 'vike-content-collection'

export function data() {
  const posts = getCollection('blog')
  return { posts }
}
```

The returned data is available in your page component via Vike's `useData()`.

## `getCollectionEntry(name, slug)`

Looks up a single entry by slug. Returns the entry or `undefined`:

```ts
import { getCollectionEntry } from 'vike-content-collection'

const post = getCollectionEntry('blog', 'getting-started')

if (post) {
  console.log(post.metadata.title)
}
```

## `findCollectionEntries(name, filter)`

Finds entries matching a filter. Always returns an array:

### By pattern (RegExp)

Pass a regular expression to match slugs:

```ts
import { findCollectionEntries } from 'vike-content-collection'

const tutorials = findCollectionEntries('blog', /^tutorial-/)
```

### By predicate (function)

Pass a function to filter entries:

```ts
const published = findCollectionEntries('blog', (entry) => !entry._isDraft)
const recent = findCollectionEntries('blog', (entry) =>
  entry.metadata.date > new Date('2025-01-01')
)
```

### By array (combined filters)

Pass an array of filters (string, RegExp, or predicate). Returns entries matching **any** filter (OR semantics):

```ts
const selected = findCollectionEntries('blog', [
  'intro',
  /^tutorial-/,
  (entry) => entry.metadata.featured === true,
])
```

### Filter summary

| Function                 | Filter type | Example                     | Returns                       |
| ------------------------ | ----------- | --------------------------- | ----------------------------- |
| `getCollectionEntry`     | `string`    | `'getting-started'`         | Single entry or `undefined`   |
| `findCollectionEntries`  | `RegExp`    | `/^tutorial-/`              | Array of matching entries     |
| `findCollectionEntries`  | Predicate   | `(e) => !e._isDraft`        | Array of matching entries     |
| `findCollectionEntries`  | Array       | `['intro', /^guide-/]`      | Array matching any filter     |

## Entry shape

Every entry returned by `getCollection`, `getCollectionEntry`, or `findCollectionEntries` has these fields:

| Field          | Type                          | Description                                           |
| -------------- | ----------------------------- | ----------------------------------------------------- |
| `filePath`     | `string`                      | Absolute path to the source file                      |
| `slug`         | `string`                      | Identifier derived from filename (or custom function) |
| `metadata`     | Inferred from schema          | Validated frontmatter data                            |
| `content`      | `string`                      | Raw markdown body (empty string for data entries)     |
| `computed`     | `Record<string, unknown>`     | Values from computed field functions                  |
| `lastModified` | `Date \| undefined`           | Git-based last modification date (opt-in)             |
| `_isDraft`     | `boolean`                     | Whether the entry is a draft                          |
| `index`        | `Record<string, Entry>`       | Lookup map of all entries in the same collection      |

### The `index` field

Each entry carries an `index` -- a record of all entries in the same collection, keyed by slug. This lets you navigate between entries without a separate `getCollection` call:

```ts
const post = getCollectionEntry('blog', 'part-2')
if (post) {
  const part1 = post.index['part-1']
  console.log(part1?.metadata.title)
}
```

## Usage patterns

### Blog listing with sorted posts

```ts
// pages/blog/+data.ts
import { getCollection, sortCollection } from 'vike-content-collection'

export function data() {
  const posts = getCollection('blog')
  const sorted = sortCollection(posts, 'date', 'desc')
  return { posts: sorted }
}
```

### Single post page

```ts
// pages/blog/@slug/+data.ts
import { getCollectionEntry, renderEntry } from 'vike-content-collection'
import type { PageContext } from 'vike/types'

export async function data(pageContext: PageContext) {
  const post = getCollectionEntry('blog', pageContext.routeParams.slug)
  if (!post) throw new Error('Post not found')

  const { html, headings } = await renderEntry(post)
  return { post, html, headings }
}
```

### Combining collections

```ts
// pages/blog/@slug/+data.ts
import { getCollectionEntry } from 'vike-content-collection'

export function data(pageContext: PageContext) {
  const post = getCollectionEntry('blog', pageContext.routeParams.slug)
  if (!post) throw new Error('Post not found')

  const author = getCollectionEntry('authors', post.metadata.author)
  return { post, author }
}
```

### Paginated listing

```ts
// pages/blog/+data.ts
import { getCollection, sortCollection, paginate } from 'vike-content-collection'

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

## Type safety

The plugin auto-generates `.vike-content-collection/types.d.ts` which augments the `CollectionMap` interface. This means:

- `getCollection('blog')` returns entries typed with the exact schema from `pages/blog/+Content.ts`
- `getCollectionEntry('blog', 'slug')` returns a properly typed entry
- `findCollectionEntries('blog', /pattern/)` returns properly typed entries
- Autocomplete works for collection names and metadata fields

No manual type annotations are needed. The types update automatically on dev server start, HMR, and builds.

## Next steps

- [Rendering Content](./rendering.md) -- converting entries to HTML
- [Advanced Features](./advanced-features.md) -- computed fields, references, drafts, sorting, and more
