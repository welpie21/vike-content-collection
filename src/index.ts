export {
	vikeContentCollectionPlugin as default,
	vikeContentCollectionPlugin,
} from "./plugin/vite-plugin.js";
export { getCollection } from "./runtime/get-collection.js";
export { getCollectionEntry } from "./runtime/get-collection-entry.js";
export type {
	Collection,
	CollectionEntry,
	CollectionMap,
	ContentCollectionConfig,
	ContentCollectionPluginOptions,
	FrontmatterLineMap,
	ParsedMarkdown,
	TypedCollectionEntry,
	ValidationIssue,
} from "./types/index.js";
