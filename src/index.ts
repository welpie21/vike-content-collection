export {
	vikeContentCollectionPlugin as default,
	vikeContentCollectionPlugin,
} from "./plugin/vite-plugin.js";
export {
	getCollection,
	getCollectionEntry,
} from "./runtime/get-collection.js";
export type { PaginationResult } from "./runtime/helpers.js";
export {
	groupBy,
	mergeCollections,
	paginate,
	sortCollection,
	uniqueValues,
} from "./runtime/helpers.js";
export {
	getAvailableLocales,
	getLocalizedEntry,
} from "./runtime/i18n.js";
export {
	getAdjacentEntries,
	getBreadcrumbs,
	getCollectionTree,
	getEntryUrl,
} from "./runtime/navigation.js";
export { reference } from "./runtime/reference.js";
export {
	buildTocTree,
	extractHeadings,
	renderEntry,
} from "./runtime/render.js";
export { createMarkdownRenderer } from "./runtime/renderers/markdown.js";
export { createMdxRenderer } from "./runtime/renderers/mdx.js";
export { getRelatedEntries } from "./runtime/search.js";
export { getSeries } from "./runtime/series.js";
export type {
	AdjacentEntries,
	Breadcrumb,
	BreadcrumbOptions,
	CollectionEntryFilter,
	CollectionEntryFilterInput,
	CollectionEntryPredicate,
	CollectionMap,
	CollectionTreeNode,
	ComputedFieldInput,
	ContentCollectionConfig,
	ContentCollectionDefinition,
	ContentCollectionPluginOptions,
	ContentRenderer,
	EntryUrlOptions,
	Heading,
	InferComputed,
	InferMetadata,
	LocaleOptions,
	MdxEvaluateOptions,
	MdxRendererOptions,
	MetadataLineMap,
	ParsedMarkdown,
	RelatedEntriesOptions,
	RenderOptions,
	RenderResult,
	ResolvedContentConfig,
	SeriesOptions,
	SeriesResult,
	SlugInput,
	TocNode,
	TypedCollectionEntry,
	ValidationIssue,
} from "./types/index.js";
