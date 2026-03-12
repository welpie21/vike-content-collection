# Rendering Content

The plugin includes a built-in rendering pipeline powered by [unified](https://unifiedjs.com/), [remark](https://github.com/remarkjs/remark), and [rehype](https://github.com/rehypejs/rehype). Use it to convert markdown entries to HTML and extract headings for navigation.

## `renderEntry(entry, options?)`

Converts a collection entry's markdown content to HTML:

```ts
import { getCollectionEntry, renderEntry } from 'vike-content-collection'

const post = getCollectionEntry('blog', 'getting-started')
if (post) {
  const { html, headings } = await renderEntry(post)
}
```

### Return value

`renderEntry` returns a `RenderResult`:

| Field      | Type        | Description                                    |
| ---------- | ----------- | ---------------------------------------------- |
| `html`     | `string`    | The rendered HTML string                       |
| `headings` | `Heading[]` | Headings extracted during rendering            |

Each heading has:

| Field   | Type     | Description                           |
| ------- | -------- | ------------------------------------- |
| `depth` | `number` | Heading level (1-6)                   |
| `text`  | `string` | Text content of the heading           |
| `id`    | `string` | Generated slug for anchor links       |

Heading elements in the rendered HTML include matching `id` attributes via [rehype-slug](https://github.com/rehypejs/rehype-slug), so `#installation` links work out of the box.

## Full example: single post page

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

```tsx
// pages/blog/@slug/+Page.tsx
import { useData } from 'vike-renderer/useData'

export function Page() {
  const { post, html, headings } = useData()

  return (
    <article>
      <h1>{post.metadata.title}</h1>
      <time>{post.metadata.date.toLocaleDateString()}</time>

      {/* Table of contents */}
      <nav>
        <ul>
          {headings.map(h => (
            <li key={h.id} style={{ marginLeft: (h.depth - 1) * 16 }}>
              <a href={`#${h.id}`}>{h.text}</a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Rendered content */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  )
}
```

## Custom remark and rehype plugins

Extend the rendering pipeline by passing custom plugins:

```ts
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

const { html, headings } = await renderEntry(post, {
  remarkPlugins: [remarkGfm],
  rehypePlugins: [rehypeHighlight],
})
```

### `RenderOptions`

| Field           | Type    | Description                           |
| --------------- | ------- | ------------------------------------- |
| `remarkPlugins` | `any[]` | Additional remark plugins to apply    |
| `rehypePlugins` | `any[]` | Additional rehype plugins to apply    |

Custom plugins are added after the built-in ones. The built-in pipeline is:

1. `remark-parse` -- parse markdown to AST
2. Heading extraction (built-in)
3. Your `remarkPlugins`
4. `remark-rehype` -- convert to HTML AST
5. `rehype-slug` -- add `id` attributes to headings
6. Your `rehypePlugins`
7. `rehype-stringify` -- serialize to HTML string

### Common plugin combinations

**GitHub Flavored Markdown** (tables, strikethrough, task lists):

```ts
import remarkGfm from 'remark-gfm'

const { html } = await renderEntry(post, {
  remarkPlugins: [remarkGfm],
})
```

**Syntax highlighting**:

```ts
import rehypeHighlight from 'rehype-highlight'

const { html } = await renderEntry(post, {
  rehypePlugins: [rehypeHighlight],
})
```

**Math rendering**:

```ts
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

const { html } = await renderEntry(post, {
  remarkPlugins: [remarkMath],
  rehypePlugins: [rehypeKatex],
})
```

## `extractHeadings(content)`

Extracts headings from raw markdown without a full HTML render. Use this when you only need a table of contents:

```ts
import { extractHeadings } from 'vike-content-collection'

const headings = await extractHeadings(post.content)
// [{ depth: 1, text: 'Title', id: 'title' }, { depth: 2, text: 'Section', id: 'section' }]
```

This parses the markdown AST just enough to find heading nodes, making it faster than `renderEntry` when you don't need the HTML output.

### When to use each

| Need                          | Use               |
| ----------------------------- | ----------------- |
| HTML + headings               | `renderEntry()`   |
| Only headings (table of contents) | `extractHeadings()` |

## Next steps

- [Advanced Features](./advanced-features.md) -- computed fields, references, drafts, sorting, and more
- [Querying Data](./querying-data.md) -- filtering and retrieving collection entries
