# Getting Started

This guide walks you through setting up `vike-content-collection` in a new or existing Vike project.

## Prerequisites

- Node.js >= 18
- An existing [Vike](https://vike.dev/) + [Vite](https://vite.dev/) project (or a new one)

## Installation

Install the plugin:

```bash
npm install vike-content-collection
```

It has three peer dependencies. Install any you don't already have:

```bash
npm install vike vite zod
```

## Project setup

There are three things to configure: the Vite plugin, the Vike config, and your TypeScript config.

### 1. Register the Vite plugin

Add the plugin to your `vite.config.ts`:

```ts
// vite.config.ts
import vikeContentCollection from 'vike-content-collection'
import vike from 'vike/plugin'

export default {
  plugins: [
    vike(),
    vikeContentCollection()
  ],
  ssr: {
    external: ['vike-content-collection']
  }
}
```

The `ssr.external` entry is required -- it tells Vite not to bundle the package during SSR so the plugin's runtime works correctly.

The plugin accepts [options](./advanced-features.md#plugin-options) but none are required to get started.

### 2. Extend the Vike config

In your root `+config.ts`, extend with the content collection config. This registers `+Content.ts` as a recognized Vike setting:

```ts
// +config.ts
import vikeContentCollectionConfig from 'vike-content-collection/config'

export default {
  extends: [vikeContentCollectionConfig]
}
```

### 3. Update tsconfig.json

The plugin generates a declaration file that powers type inference. Add the generated directory to your TypeScript includes:

```json
{
  "include": [
    "src",
    ".vike-content-collection/**/*"
  ]
}
```

The file `.vike-content-collection/types.d.ts` is regenerated automatically when the dev server starts, on HMR updates, and during builds. You should add `.vike-content-collection/` to your `.gitignore`.

## Your first collection

### 1. Define the schema

Create a `+Content.ts` file in a page directory. Export a Zod schema that describes the shape of your content's frontmatter:

```ts
// pages/blog/+Content.ts
import { z } from 'zod'

export const Content = z.object({
  title: z.string(),
  date: z.date(),
  tags: z.array(z.string()).optional()
})
```

### 2. Add a content file

Create a `.md` or `.mdx` file in the same directory. The YAML frontmatter must match the schema:

```md
<!-- pages/blog/hello-world.md -->
---
title: "Hello World"
date: 2025-03-10T00:00:00.000Z
tags:
  - introduction
---

This is my first blog post using vike-content-collection.
```

The slug for this entry will be `"hello-world"` (derived from the filename).

### 3. Query the collection

Use `getCollection()` in a `+data.ts` file to load your content and pass it to the page:

```ts
// pages/blog/+data.ts
import { getCollection } from 'vike-content-collection'

export function data() {
  const posts = getCollection('blog')
  return { posts }
}
```

The collection name `"blog"` matches the directory where `+Content.ts` lives relative to your content root (defaults to `pages/`).

### 4. Render on the page

Access the data in your page component via Vike's `useData()`:

```tsx
// pages/blog/+Page.tsx
import { useData } from 'vike-renderer/useData'

export function Page() {
  const { posts } = useData()

  return (
    <ul>
      {posts.map(post => (
        <li key={post.slug}>
          <h2>{post.metadata.title}</h2>
          <time>{post.metadata.date.toLocaleDateString()}</time>
        </li>
      ))}
    </ul>
  )
}
```

## Verification

Start the dev server:

```bash
npm run dev
```

If your schema and markdown are valid, the page renders with your content. If the frontmatter doesn't match the schema, you'll see a detailed validation error pointing to the exact file and line:

```
ContentCollectionValidationError: [vike-content-collection] Schema validation failed:
  pages/blog/hello-world.md:3 (at "title"): Expected string, received number
```

## Project structure

A typical project looks like this:

```
my-project/
├── pages/
│   ├── +config.ts              # Vike config with extends
│   ├── blog/
│   │   ├── +Content.ts         # Zod schema for blog posts
│   │   ├── +data.ts            # Load posts with getCollection()
│   │   ├── +Page.tsx           # Render posts
│   │   ├── hello-world.md      # Blog post
│   │   └── second-post.md      # Another blog post
│   └── authors/
│       ├── +Content.ts         # Zod schema for author data
│       └── jane.yaml           # Author data file
├── vite.config.ts              # Vite + plugin registration
├── tsconfig.json               # includes .vike-content-collection/**/*
└── .vike-content-collection/   # auto-generated types (gitignored)
    └── types.d.ts
```

## Next steps

- [Defining Collections](./defining-collections.md) -- schema formats, data collections, and content directories
- [Querying Data](./querying-data.md) -- filtering, entry shape, and usage patterns
- [Rendering Content](./rendering.md) -- markdown to HTML, headings, and custom plugins
- [Advanced Features](./advanced-features.md) -- computed fields, references, drafts, and more
