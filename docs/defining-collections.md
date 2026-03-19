# Defining Collections

A collection is defined by a `+Content.ts` file that exports a Zod schema. The plugin discovers these files, validates your content against the schema, and makes the data available at runtime.

## Schema formats

### Simple schema

The most common format. Export `Content` as a Zod schema directly:

```ts
// pages/blog/+Content.ts
import { z } from 'zod'

export const Content = z.object({
  title: z.string(),
  date: z.date(),
  tags: z.array(z.string()).optional()
})
```

The plugin detects this format by checking for a `safeParse` method on the export.

### Extended config

For features like computed fields, custom slugs, or data collections, export an object with a `schema` property:

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

  computed: {
    readingTime: ({ content }) => Math.ceil(content.split(/\s+/).length / 200),
  },

  slug: ({ metadata, defaultSlug }) => metadata.permalink ?? defaultSlug,

  contentPath: 'articles', // fetch files from <contentRoot>/articles/ instead of <contentRoot>/blog/
}
```

The extended config supports these fields:

| Field         | Type       | Description                                              |
| ------------- | ---------- | -------------------------------------------------------- |
| `schema`      | `ZodSchema` | **Required.** Zod schema for validating frontmatter     |
| `type`        | `'content' \| 'data'` | Collection type (default: `'content'`)       |
| `computed`    | `Record<string, Function>` | Functions that derive extra data per entry |
| `slug`        | `Function` | Custom slug generation                                   |
| `contentPath` | `string`   | Override the folder inside the content root to fetch files from |

See [Computed fields](./advanced-features.md#computed-fields) and [Custom slugs](./advanced-features.md#custom-slugs) for details.

### Export styles

All of these are equivalent:

```ts
// Named export (recommended)
export const Content = z.object({ ... })

// Default export wrapping Content
export default { Content: z.object({ ... }) }

// Direct default export
export default z.object({ ... })
```

## Collection naming

The collection name is automatically derived from the directory path of `+Content.ts` relative to the content root:

| `+Content.ts` location          | Collection name |
| -------------------------------- | --------------- |
| `pages/blog/+Content.ts`        | `"blog"`        |
| `pages/docs/guides/+Content.ts` | `"docs/guides"` |
| `pages/+Content.ts`             | `"."`           |

This name is what you pass to `getCollection()`, `getCollectionEntry()`, and `findCollectionEntries()`.

## Content collections (markdown and MDX)

The default collection type. The plugin scans for `.md` and `.mdx` files and parses YAML frontmatter:

```md
---
title: "My Post"
date: 2025-06-15T00:00:00.000Z
---

The markdown body becomes the `content` field on each entry.
```

The frontmatter is validated against your schema. The body text is available as `entry.content`.

### File discovery

By default, the plugin looks for `.md` and `.mdx` files in the same directory as the `+Content.ts` file and its subdirectories. Files are matched recursively.

MDX files (`.mdx`) work exactly like markdown files -- they have YAML frontmatter and a body. The difference is that MDX content can include JSX syntax. Use `createMdxRenderer()` to render MDX entries (see [Rendering Content](./rendering.md#mdx-rendering)).

## Data collections

For structured data without a markdown body -- author profiles, navigation config, product catalogs -- set `type: 'data'`:

```ts
// pages/authors/+Content.ts
import { z } from 'zod'

export const Content = {
  type: 'data',
  schema: z.object({
    name: z.string(),
    bio: z.string(),
    avatar: z.string().url(),
    social: z.object({
      twitter: z.string().optional(),
      github: z.string().optional()
    }).optional()
  })
}
```

The plugin scans for `.json`, `.yaml`/`.yml`, and `.toml` files. Each file is one entry, and its entire content is validated against the schema. The `content` field is an empty string for data entries.

**Example data file:**

```yaml
# pages/authors/jane-doe.yaml
name: Jane Doe
bio: Writer and developer
avatar: https://example.com/jane.jpg
social:
  github: janedoe
```

This entry has the slug `"jane-doe"` and is accessible via `getCollection('authors')`.

## Content directory configuration

### Default behavior

Content files live alongside their `+Content.ts`:

```
pages/blog/
├── +Content.ts
├── hello-world.md
└── another-post.md
```

### Separate content root

Set `contentRoot` to keep content files in a different directory:

```ts
// vite.config.ts
vikeContentCollection({ contentRoot: 'content' })
```

With this config, a collection defined at `pages/blog/+Content.ts` loads its files from `content/blog/` instead:

```
pages/blog/
└── +Content.ts          # schema definition

content/blog/
├── hello-world.md       # content lives here
└── another-post.md
```

This is useful when you want to separate schema definitions from content files.

### Config scan directory

By default, the plugin scans `pages/` for `+Content.ts` files. Change this with `contentDir`:

```ts
vikeContentCollection({ contentDir: 'src/pages' })
```

### Per-collection content path

You can also override the content folder on a per-collection basis using `contentPath` in the extended config. This takes precedence over the default collection-name-based folder:

```ts
// pages/blog/+Content.ts
export const Content = {
  schema: z.object({ title: z.string() }),
  contentPath: 'articles',
}
```

With `contentRoot: 'content'`, this collection fetches files from `content/articles/` instead of `content/blog/`:

```
pages/blog/
└── +Content.ts          # schema definition (contentPath: 'articles')

content/articles/        # files are loaded from here
├── hello-world.md
└── another-post.md
```

Without a `contentRoot`, files are loaded from `pages/articles/` instead.

## Schema validation errors

When a file's frontmatter doesn't match the schema, the plugin halts with a precise error:

```
ContentCollectionValidationError: [vike-content-collection] Schema validation failed:
  pages/blog/hello-world.md:4 (at "metadata.name"): Expected string, received number
```

The error includes:

- **File path** -- which file failed
- **Line number** -- where in the frontmatter the issue is (for markdown files)
- **Zod error path** -- which field failed (e.g. `metadata.name`)
- **Message** -- the Zod validation message

This works in both `vite dev` (surfaced via HMR) and `vite build` (stops the build).

## Next steps

- [Querying Data](./querying-data.md) -- how to retrieve and filter your collections
- [Rendering Content](./rendering.md) -- converting markdown entries to HTML
- [Advanced Features](./advanced-features.md) -- computed fields, references, drafts, and more
