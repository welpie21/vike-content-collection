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
export type { Heading, RenderOptions, RenderResult } from "./runtime/render.js";
export { extractHeadings, renderEntry } from "./runtime/render.js";
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
	InferComputed,
	InferMetadata,
	MetadataLineMap,
	ParsedMarkdown,
	ResolvedContentConfig,
	SlugInput,
	TypedCollectionEntry,
	ValidationIssue,
} from "./types/index.js";
