import type { ZodType } from "zod";

export type { ValidationIssue } from "../plugin/errors.js";
export type { MetadataLineMap, ParsedMarkdown } from "../plugin/markdown.js";
export type { ContentCollectionPluginOptions } from "../plugin/vite-plugin.js";

export interface ContentCollectionConfig {
	Content: ZodType;
}

/** Extracts the output type from a Zod schema. */
type InferZod<S> = S extends ZodType<infer T> ? T : Record<string, unknown>;

/** Input passed to computed field functions. */
export interface ComputedFieldInput<TMetadata = Record<string, unknown>> {
	metadata: TMetadata;
	content: string;
	filePath: string;
	slug: string;
}

/** Input passed to custom slug functions. */
export interface SlugInput<TMetadata = Record<string, unknown>> {
	metadata: TMetadata;
	filePath: string;
	defaultSlug: string;
}

/** Extended config object for +Content.ts that supports computed fields, custom slugs, etc. */
export interface ContentCollectionDefinition<S extends ZodType = ZodType> {
	/** Whether this is a markdown content collection, a data-only collection, or both. Defaults to 'content'. */
	type?: "content" | "data" | "both";
	/** Zod schema for validating metadata (content) or the full data file (data). */
	schema: S;
	/** Functions that derive additional data from each entry. */
	computed?: Record<
		string,
		(input: ComputedFieldInput<InferZod<S>>) => unknown
	>;
	/** Custom slug generation function. */
	slug?: (input: SlugInput<InferZod<S>>) => string;
	/** Override the folder inside the content root to fetch files from.
	 *  By default, the collection name (derived from the +Content.ts path) is used. */
	contentPath?: string;
}

/** Resolved config after normalizing a plain schema or definition object. */
export interface ResolvedContentConfig {
	type: "content" | "data" | "both";
	schema: ZodType;
	computed: Record<string, (input: ComputedFieldInput) => unknown>;
	slug: ((input: SlugInput) => string) | null;
	contentPath: string | null;
}

/**
 * Augmentable interface mapping collection names to their metadata types.
 * The generated declaration file populates this with z.infer<typeof Content>
 * for each +Content.ts found in the project.
 */
// biome-ignore lint/suspicious/noEmptyInterface: intentional empty interface for declaration merging
export interface CollectionMap {}

/**
 * Resolves to the union of known collection names when `CollectionMap` is
 * populated by the generated declaration file, otherwise falls back to
 * `string` so code still compiles before type generation.
 */
export type CollectionName = keyof CollectionMap extends never
	? string
	: keyof CollectionMap;

/**
 * A single entry in a content collection, with typed metadata and computed fields.
 *
 * Returned by `getCollection()`, `getCollectionEntry()`, and all other
 * runtime query functions. The type parameters are inferred automatically
 * when the generated declaration file augments `CollectionMap`.
 */
export interface TypedCollectionEntry<
	TMetadata,
	TComputed = Record<string, unknown>,
> {
	/** Absolute path to the source file. */
	filePath: string;
	/** Identifier derived from the filename (or a custom slug function). */
	slug: string;
	/** Validated frontmatter (content collections) or parsed data (data collections). */
	metadata: TMetadata;
	/** Raw markdown body. Empty string for data-only entries. */
	content: string;
	/** Values produced by computed field functions defined in `+Content.ts`. */
	computed: TComputed;
	/** Git-based last-modification date, if the `lastModified` plugin option is enabled. */
	lastModified: Date | undefined;
}

/** Extract the metadata type from a CollectionMap entry (supports both old and new format). */
export type InferMetadata<T> = T extends { metadata: infer M } ? M : T;

/** Extract the computed type from a CollectionMap entry. */
export type InferComputed<T> = T extends { computed: infer C }
	? C
	: Record<string, unknown>;

/** Result of rendering a content entry. */
export interface RenderResult {
	html: string;
	headings: Heading[];
}

/** A heading extracted from content. */
export interface Heading {
	depth: number;
	text: string;
	id: string;
}

/** Options for rendering a content entry. */
export interface RenderOptions {
	remarkPlugins?: any[];
	rehypePlugins?: any[];
	renderer?: ContentRenderer;
}

/**
 * A pluggable content renderer. Implement this interface to provide
 * custom markdown or MDX rendering logic.
 */
export interface ContentRenderer {
	render(
		content: string,
		options?: { remarkPlugins?: any[]; rehypePlugins?: any[] },
	): Promise<RenderResult>;
}

/** Options for full JSX evaluation in the MDX renderer. */
export interface MdxEvaluateOptions {
	/** JSX factory function (from your framework's jsx-runtime). */
	jsx: (type: any, props: any, key?: string) => any;
	/** JSX factory for static children (from your framework's jsx-runtime). */
	jsxs: (type: any, props: any, key?: string) => any;
	/** Fragment component (from your framework's jsx-runtime). */
	Fragment: any;
	/** Converts the rendered MDX component to an HTML string. */
	renderToHtml: (component: any) => string | Promise<string>;
	/** Custom components available in MDX files (keyed by component name). */
	components?: Record<string, any>;
	/** Base URL for resolving relative imports in compiled MDX. Defaults to import.meta.url. */
	baseUrl?: string;
}

/** Options specific to createMdxRenderer(). */
export interface MdxRendererOptions extends Omit<RenderOptions, "renderer"> {
	/** Vite-compatible resolve config for alias support in MDX import statements. */
	resolve?: {
		alias?: Record<string, string>;
	};
	/** Enable full JSX evaluation mode. Without this, JSX elements render as HTML tags. */
	evaluate?: MdxEvaluateOptions;
}

/** A single breadcrumb segment in a navigation trail. */
export interface Breadcrumb {
	label: string;
	path: string;
}

/** Options for generating breadcrumbs from a collection path. */
export interface BreadcrumbOptions {
	/** Map path segments to display labels (e.g. `{ docs: "Documentation" }`). */
	labels?: Record<string, string>;
	/** Path prefix prepended to all breadcrumb paths. Defaults to `"/"`. */
	basePath?: string;
	/** Whether to include the current entry as the last breadcrumb. Defaults to `true`. */
	includeCurrent?: boolean;
	/** Override the label for the current entry breadcrumb. */
	currentLabel?: string;
}

/** Previous and next entries relative to a given entry in a collection. */
export interface AdjacentEntries<
	TMetadata,
	TComputed = Record<string, unknown>,
> {
	prev: TypedCollectionEntry<TMetadata, TComputed> | undefined;
	next: TypedCollectionEntry<TMetadata, TComputed> | undefined;
}

/** A node in a nested table-of-contents tree built from flat headings. */
export interface TocNode {
	depth: number;
	text: string;
	id: string;
	children: TocNode[];
}

/** A node in the collection hierarchy tree. */
export interface CollectionTreeNode {
	/** Segment name (e.g. `"guides"`). */
	name: string;
	/** Full collection name (e.g. `"docs/guides"`), or empty string for intermediate-only nodes. */
	fullName: string;
	/** Child collection nodes. */
	children: CollectionTreeNode[];
}

/** Options for finding related entries by shared metadata values. */
export interface RelatedEntriesOptions {
	/** Metadata fields to compare for overlap (e.g. `["tags", "category"]`). */
	by: string[];
	/** Maximum number of related entries to return. Defaults to `5`. */
	limit?: number;
}

/** Options for generating an entry URL path. */
export interface EntryUrlOptions {
	/** Path prefix prepended to the URL. Defaults to `"/"`. */
	basePath?: string;
	/** File extension appended to the slug (e.g. `".html"`). */
	extension?: string;
}

/** Result of resolving a content series for a given entry. */
export interface SeriesResult<TMetadata, TComputed = Record<string, unknown>> {
	/** Series identifier. */
	name: string;
	/** All entries in the series, sorted by order. */
	entries: TypedCollectionEntry<TMetadata, TComputed>[];
	/** Zero-based index of the current entry within the series. */
	currentIndex: number;
	/** Total number of entries in the series. */
	total: number;
	/** Previous entry in the series, or `undefined` if current is first. */
	prev: TypedCollectionEntry<TMetadata, TComputed> | undefined;
	/** Next entry in the series, or `undefined` if current is last. */
	next: TypedCollectionEntry<TMetadata, TComputed> | undefined;
}

/** Options for configuring series field names. */
export interface SeriesOptions {
	/** Metadata field that holds the series name. Defaults to `"series"`. */
	seriesField?: string;
	/** Metadata field that holds the sort order within the series. Defaults to `"seriesOrder"`. */
	orderField?: string;
}

/** Options for i18n locale detection strategy. */
export interface LocaleOptions {
	/** How to detect locales: by slug suffix or metadata field. Defaults to `"suffix"`. */
	strategy?: "suffix" | "metadata";
	/** Metadata field name when using the `"metadata"` strategy. Defaults to `"locale"`. */
	field?: string;
	/** Separator between base slug and locale in suffix strategy. Defaults to `"."`. */
	separator?: string;
}

/** Predicate function used to filter collection entries. */
export type CollectionEntryPredicate<T, C = Record<string, unknown>> = (
	entry: TypedCollectionEntry<T, C>,
) => boolean;

/** A single filter criterion: exact slug, regex pattern, or predicate. */
export type CollectionEntryFilter<T, C = Record<string, unknown>> =
	| string
	| RegExp
	| CollectionEntryPredicate<T, C>;

/** One or more filter criteria for `findCollectionEntries()`. An array matches entries against each filter with OR semantics. */
export type CollectionEntryFilterInput<T, C = Record<string, unknown>> =
	| CollectionEntryFilter<T, C>
	| CollectionEntryFilter<T, C>[];

/** A registered content collection. */
export interface ContentCollection {
	name: string;
	path: string;
	type: "content" | "data" | "both";
}
