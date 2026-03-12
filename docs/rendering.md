# Rendering Content

The plugin includes a pluggable rendering system with built-in renderers for markdown and MDX, powered by [unified](https://unifiedjs.com/), [remark](https://github.com/remarkjs/remark), and [rehype](https://github.com/rehypejs/rehype). Use it to convert content entries to HTML and extract headings for navigation. You can also implement your own `ContentRenderer` for custom rendering pipelines.

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

| Field           | Type              | Description                                          |
| --------------- | ----------------- | ---------------------------------------------------- |
| `remarkPlugins` | `any[]`           | Additional remark plugins to apply                   |
| `rehypePlugins` | `any[]`           | Additional rehype plugins to apply                   |
| `renderer`      | `ContentRenderer` | Custom renderer (defaults to built-in markdown)      |

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

## MDX rendering

For `.mdx` files that contain JSX syntax, use `createMdxRenderer()`:

```ts
import { createMdxRenderer, getCollectionEntry, renderEntry } from 'vike-content-collection'

const mdxRenderer = createMdxRenderer()

const post = getCollectionEntry('blog', 'my-mdx-post')
if (post) {
  const { html, headings } = await renderEntry(post, { renderer: mdxRenderer })
}
```

The MDX renderer uses `remark-mdx` to parse MDX syntax within the unified pipeline. JSX elements are serialized as their HTML tag equivalents in the output. The heading extraction works the same as with the markdown renderer.

### Reusing the MDX renderer

Create the renderer once and reuse it across renders:

```ts
const mdxRenderer = createMdxRenderer({
  remarkPlugins: [remarkGfm],
})

// Use for all MDX entries
for (const entry of mdxEntries) {
  const { html } = await renderEntry(entry, { renderer: mdxRenderer })
}
```

### When to use which renderer

| File type | Renderer | Usage |
| --------- | -------- | ----- |
| `.md`     | Default (markdown) | `renderEntry(entry)` |
| `.mdx`    | MDX | `renderEntry(entry, { renderer: createMdxRenderer() })` |
| Custom    | Your own | `renderEntry(entry, { renderer: myRenderer })` |

## Custom renderers

Implement the `ContentRenderer` interface to provide your own rendering pipeline:

```ts
import type { ContentRenderer, RenderResult } from 'vike-content-collection'

const myRenderer: ContentRenderer = {
  async render(content, options): Promise<RenderResult> {
    // Your custom rendering logic here
    const html = myCustomRender(content)
    const headings = myCustomHeadingExtractor(content)
    return { html, headings }
  }
}
```

Pass it to `renderEntry()`:

```ts
const { html, headings } = await renderEntry(post, { renderer: myRenderer })
```

### `ContentRenderer` interface

```ts
interface ContentRenderer {
  render(
    content: string,
    options?: { remarkPlugins?: any[]; rehypePlugins?: any[] },
  ): Promise<RenderResult>
}
```

The `options` parameter receives any `remarkPlugins` and `rehypePlugins` passed to `renderEntry()`. Your renderer can use them or ignore them depending on your implementation.

### Built-in renderer factories

Both built-in renderers accept default plugins that are applied on every render:

```ts
import { createMarkdownRenderer, createMdxRenderer } from 'vike-content-collection'

const mdRenderer = createMarkdownRenderer({
  remarkPlugins: [remarkGfm],
  rehypePlugins: [rehypeHighlight],
})

const mdxRenderer = createMdxRenderer({
  remarkPlugins: [remarkGfm],
})
```

Per-call plugins passed to `renderEntry()` are merged after the defaults.

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

- [Advanced Features](./advanced-features.md) -- computed fields, references, drafts, custom renderers, and more
- [Querying Data](./querying-data.md) -- filtering and retrieving collection entries
