import type { ZodSchema } from "zod";

export type {
	Collection,
	CollectionEntry,
} from "../plugin/collection-store.js";
export type { ValidationIssue } from "../plugin/errors.js";
export type { FrontmatterLineMap, ParsedMarkdown } from "../plugin/markdown.js";
export type { ContentCollectionPluginOptions } from "../plugin/vite-plugin.js";

export interface ContentCollectionConfig {
	Content: ZodSchema;
}

/**
 * Augmentable interface mapping collection names to their frontmatter types.
 * The generated declaration file populates this with z.infer<typeof Content>
 * for each +Content.ts found in the project.
 */
// biome-ignore lint/suspicious/noEmptyInterface: intentional empty interface for declaration merging
export interface CollectionMap {}

export interface TypedCollectionEntry<T> {
	filePath: string;
	slug: string;
	frontmatter: T;
	content: string;
	index: Record<string, TypedCollectionEntry<T>>;
}

/** Predicate function used to filter collection entries. */
export type CollectionEntryPredicate<T> = (
	entry: TypedCollectionEntry<T>,
) => boolean;

/** A single filter criterion: exact slug, regex pattern, or predicate. */
export type CollectionEntryFilter<T> =
	| string
	| RegExp
	| CollectionEntryPredicate<T>;

/** One or more filter criteria. An array matches entries against each filter with OR semantics. */
export type CollectionEntryFilterInput<T> =
	| CollectionEntryFilter<T>
	| CollectionEntryFilter<T>[];
