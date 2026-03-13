import type { ZodSchema } from "zod";

export type {
	Collection,
	CollectionEntry,
} from "../plugin/collection-store.js";
export type { ValidationIssue } from "../plugin/errors.js";
export type { MetadataLineMap, ParsedMarkdown } from "../plugin/markdown.js";
export type { ContentCollectionPluginOptions } from "../plugin/vite-plugin.js";

export interface ContentCollectionConfig {
	Content: ZodSchema;
}

/** Input passed to computed field functions. */
export interface ComputedFieldInput {
	metadata: Record<string, unknown>;
	content: string;
	filePath: string;
	slug: string;
}

/** Input passed to custom slug functions. */
export interface SlugInput {
	metadata: Record<string, unknown>;
	filePath: string;
	defaultSlug: string;
}

/** Extended config object for +Content.ts that supports computed fields, custom slugs, etc. */
export interface ContentCollectionDefinition {
	/** Whether this is a markdown content collection or a data-only collection. Defaults to 'content'. */
	type?: "content" | "data";
	/** Zod schema for validating metadata (content) or the full data file (data). */
	schema: ZodSchema;
	/** Functions that derive additional data from each entry. */
	computed?: Record<string, (input: ComputedFieldInput) => unknown>;
	/** Custom slug generation function. */
	slug?: (input: SlugInput) => string;
	/** Override the folder inside the content root to fetch files from.
	 *  By default, the collection name (derived from the +Content.ts path) is used. */
	contentPath?: string;
}

/** Resolved config after normalizing a plain schema or definition object. */
export interface ResolvedContentConfig {
	type: "content" | "data";
	schema: ZodSchema;
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

export interface TypedCollectionEntry<
	TMetadata,
	TComputed = Record<string, unknown>,
> {
	filePath: string;
	slug: string;
	metadata: TMetadata;
	content: string;
	computed: TComputed;
	lastModified: Date | undefined;
	_isDraft: boolean;
	index: Record<string, TypedCollectionEntry<TMetadata, TComputed>>;
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

/** Predicate function used to filter collection entries. */
export type CollectionEntryPredicate<T, C = Record<string, unknown>> = (
	entry: TypedCollectionEntry<T, C>,
) => boolean;

/** A single filter criterion: exact slug, regex pattern, or predicate. */
export type CollectionEntryFilter<T, C = Record<string, unknown>> =
	| string
	| RegExp
	| CollectionEntryPredicate<T, C>;

/** One or more filter criteria. An array matches entries against each filter with OR semantics. */
export type CollectionEntryFilterInput<T, C = Record<string, unknown>> =
	| CollectionEntryFilter<T, C>
	| CollectionEntryFilter<T, C>[];
