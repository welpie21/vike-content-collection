export {
	vikeContentCollectionPlugin as default,
	vikeContentCollectionPlugin,
} from "./plugin/vite-plugin.js";
export {
	getCollection,
	getCollectionEntry,
} from "./runtime/get-collection.js";
export type { PaginationResult } from "./runtime/helpers.js";
export { paginate, sortCollection } from "./runtime/helpers.js";
export { reference } from "./runtime/reference.js";
export { extractHeadings, renderEntry } from "./runtime/render.js";
export { createMarkdownRenderer } from "./runtime/renderers/markdown.js";
export { createMdxRenderer } from "./runtime/renderers/mdx.js";
export type {
	Collection,
	CollectionEntry,
	CollectionEntryFilter,
	CollectionEntryFilterInput,
	CollectionEntryPredicate,
	CollectionMap,
	ComputedFieldInput,
	ContentCollectionConfig,
	ContentCollectionDefinition,
	ContentCollectionPluginOptions,
	ContentRenderer,
	Heading,
	InferComputed,
	InferMetadata,
	MetadataLineMap,
	ParsedMarkdown,
	RenderOptions,
	RenderResult,
	ResolvedContentConfig,
	SlugInput,
	TypedCollectionEntry,
	ValidationIssue,
} from "./types/index.js";
