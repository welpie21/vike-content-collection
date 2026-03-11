import type { ZodSchema } from 'zod'

export type { ContentCollectionPluginOptions } from '../plugin/vite-plugin.js'
export type { CollectionEntry, Collection } from '../plugin/collection-store.js'
export type { ParsedMarkdown, FrontmatterLineMap } from '../plugin/markdown.js'
export type { ValidationIssue } from '../plugin/errors.js'

export interface ContentCollectionConfig {
  schema: ZodSchema
}

/**
 * Augmentable interface mapping collection names to their frontmatter types.
 * The generated declaration file populates this with z.infer<typeof schema>
 * for each +Content.ts found in the project.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CollectionMap {}

export interface TypedCollectionEntry<T> {
  filePath: string
  frontmatter: T
  content: string
}
