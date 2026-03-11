import type { ZodSchema } from 'zod'

export type { ContentCollectionPluginOptions } from '../plugin/vite-plugin.js'
export type { CollectionEntry, Collection } from '../plugin/collection-store.js'
export type { ParsedMarkdown, FrontmatterLineMap } from '../plugin/markdown.js'
export type { ValidationIssue } from '../plugin/errors.js'

export interface ContentCollectionConfig {
  schema: ZodSchema
}
