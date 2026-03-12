# vike-content-collection

A content collection plugin for [Vike](https://vike.dev/) + [Vite](https://vite.dev/) that lets you define typed, schema-validated markdown collections using [zod](https://zod.dev/).

Define a zod schema in a `+Content.ts` file, and the plugin will parse the YAML frontmatter of your markdown files, validate it against your schema, and make the resulting data available at build time and during development -- both through Vike's `pageContext` and as a virtual module consumable by other Vite plugins. Markdown files can live alongside the config or in a separate content directory.

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

Create a `+Content.ts` file in any page directory. Export `Content` as a zod schema that describes the frontmatter shape of your markdown files:

```ts
// pages/blog/+Content.ts
import { z } from 'zod'

export const Content = z.object({
  title: z.string(),
  metadata: z.object({
    name: z.string(),
    date: z.date()
  })
})
```

The plugin supports both named and default exports:

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
metadata:
  name: "Jane Doe"
  date: 2025-03-10T00:00:00.000Z
---

This is the body content of the post.
```

By default, the plugin discovers `.md` files in the same directory as the `+Content.ts` config. When `contentRoot` is set, it looks in `contentRoot/<collectionName>/` instead. For example, with `contentRoot: 'content'` and a config at `pages/blog/+Content.ts`, markdown files are loaded from `content/blog/`.

### Accessing collection data

#### Via `getCollection()` (recommended)

The plugin exports a typesafe `getCollection()` function. Call it with the collection name (the directory path relative to the content root where `+Content.ts` lives):

```ts
// pages/blog/+data.ts
import { getCollection } from 'vike-content-collection'

export function data() {
  const posts = getCollection('blog')
  // posts is fully typed: { filePath, frontmatter, content }[]
  // frontmatter type is inferred from the zod schema in +Content.ts
  return { posts }
}
```

The collection name is derived from the directory structure. For example:

| `+Content.ts` location             | Collection name          |
| ----------------------------------- | ------------------------ |
| `pages/blog/+Content.ts`           | `"blog"`                 |
| `pages/docs/guides/+Content.ts`    | `"docs/guides"`          |

#### Type generation

The plugin automatically generates a `.vike-content-collection/types.d.ts` declaration file that maps each collection name to its inferred zod schema type. To enable type inference, add the generated directory to your `tsconfig.json`:

```json
{
  "include": [
    "src",
	".vike-content-collection/**/*"
  ]
}
```

The declaration file is regenerated on every build and during HMR in development. It imports the `Content` export from each `+Content.ts` and uses `z.infer<typeof Content>` to derive the frontmatter types, so `getCollection()` returns fully typed entries without any manual type annotations.

#### Via the virtual module

Other Vite plugins or application code can also import collection data through the virtual module:

```ts
import { collections } from 'virtual:content-collection'
```

The `collections` object is a record keyed by the directory path of each `+Content.ts`, with each value containing an `entries` array of `{ filePath, frontmatter, content }`.

#### Via Vike's pageContext

Because `Content` is registered as a Vike setting through the `meta` system, the schema is available on `pageContext.config.Content` in server-side hooks like `+data.ts`.

## Schema Validation Errors

When a markdown file's frontmatter fails validation, the build halts with a detailed error that includes:

- The file path of the offending markdown file
- The line number within the frontmatter where the issue was found
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
  contentDir: 'pages',    // where +Content.ts files are scanned (default: "pages")
  contentRoot: 'content', // where .md files live (default: same as contentDir)
})
```

| Option        | Type     | Default        | Description                                                                  |
| ------------- | -------- | -------------- | ---------------------------------------------------------------------------- |
| `contentDir`  | `string` | `"pages"`      | Root directory to scan for `+Content.ts` config files.                       |
| `contentRoot` | `string` | same as `contentDir` | Root directory where markdown files live. Collection name maps to a subdirectory. |

## How It Works

1. **Scan** -- On `buildStart`, the plugin recursively searches `contentDir` for `+Content.ts` files. Each must export a zod schema as `Content` (named or default export).
2. **Parse** -- For each `+Content.ts` found, it collects all `.md` files from the corresponding content directory (either co-located or under `contentRoot/<collectionName>/`) and parses their YAML frontmatter using [gray-matter](https://github.com/jonschlinkert/gray-matter).
3. **Validate** -- Each parsed frontmatter object is validated against the zod schema. On failure, zod error paths are mapped back to specific line numbers in the source markdown file.
4. **Store** -- Validated entries are held in an in-memory store, keyed by collection name (directory path relative to content root).
5. **Generate types** -- A `.vike-content-collection/types.d.ts` declaration file is emitted, importing the `Content` export and using `z.infer` to map collection names to their frontmatter types. This powers the typesafe `getCollection()` function.
6. **Serve** -- A virtual module (`virtual:content-collection`) exposes the serialized collection data to application code and other plugins.
7. **HMR** -- During development, changes to `.md` files or `+Content.ts` configs trigger re-parsing, re-validation, and type regeneration. The virtual module is invalidated so consumers receive updated data.

## Exported Types

The package exports the following TypeScript types from the main entry point:

```ts
import { getCollection } from 'vike-content-collection'

import type {
  ContentCollectionPluginOptions,
  ContentCollectionConfig,
  CollectionEntry,
  Collection,
  CollectionMap,
  TypedCollectionEntry,
  ParsedMarkdown,
  FrontmatterLineMap,
  ValidationIssue,
} from 'vike-content-collection'
```

| Type                             | Description                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `ContentCollectionPluginOptions` | Options accepted by the `vikeContentCollection()` factory.                    |
| `ContentCollectionConfig`        | Shape of the `+Content.ts` export (`{ Content: ZodSchema }`).                |
| `CollectionEntry`                | A single validated markdown entry (frontmatter, content, file path).          |
| `Collection`                     | A full collection (name, config path, directory, array of entries).           |
| `CollectionMap`                  | Augmentable interface mapping collection names to frontmatter types.          |
| `TypedCollectionEntry<T>`        | A collection entry with typed frontmatter, returned by `getCollection()`.    |
| `ParsedMarkdown`                 | Result of parsing a markdown file (frontmatter, content, line map).           |
| `FrontmatterLineMap`             | Maps frontmatter key paths to their 1-based line numbers.                     |
| `ValidationIssue`                | A single validation error with file, line, path, and message.                 |

## Requirements

- Node.js >= 18
- Vite >= 6.0.0
- Vike >= 0.4.250
- Zod >= 3.0.0

## License

MIT
