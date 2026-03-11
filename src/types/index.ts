import type { ZodSchema } from "zod";

export type {
	Collection,
	CollectionEntry,
} from "../plugin/collection-store.js";
export type { ValidationIssue } from "../plugin/errors.js";
export type { FrontmatterLineMap, ParsedMarkdown } from "../plugin/markdown.js";
export type { ContentCollectionPluginOptions } from "../plugin/vite-plugin.js";

export interface ContentCollectionConfig {
	schema: ZodSchema;
}

/**
 * Augmentable interface mapping collection names to their frontmatter types.
 * The generated declaration file populates this with z.infer<typeof schema>
 * for each +Content.ts found in the project.
 */
// biome-ignore lint/complexity/noBannedTypes: intentional empty type for declaration merging
export type CollectionMap = {};

export interface TypedCollectionEntry<T> {
	slug: string;
	filePath: string;
	frontmatter: T;
	content: string;
}
