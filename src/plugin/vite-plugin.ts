import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { createJiti } from "jiti";
import type { ZodSchema } from "zod";
import type {
	ComputedFieldInput,
	ContentCollectionDefinition,
	ResolvedContentConfig,
	SlugInput,
} from "../types/index.js";
import { type CollectionEntry, getGlobalStore } from "./collection-store.js";
import { parseDataFile } from "./data-parser.js";
import { ContentCollectionError } from "./errors.js";
import { generateDeclarationFile } from "./generate-types.js";
import { getLastModified } from "./git.js";
import { parseMarkdownFile } from "./markdown.js";
import { validateReferences } from "./reference-validator.js";
import { validateMetadata } from "./validation.js";

const VIRTUAL_MODULE_ID = "virtual:content-collection";
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;
const NOOP_MODULE_ID = "\0vike-content-collection-noop";
const CONTENT_CONFIG_PATTERN = /\+Content\.(ts|js|mts|mjs)$/;
const MARKDOWN_PATTERN = /\.mdx?$/i;
const DATA_FILE_PATTERN = /\.(json|ya?ml|toml)$/i;

const CLIENT_NOOP_CODE = [
	"export const vikeContentCollectionPlugin = () => ({});",
	"export default vikeContentCollectionPlugin;",
	"export const getCollection = () => [];",
	"export const getCollectionEntry = () => undefined;",
	"export const paginate = (_entries, _options) => ({ items: [], currentPage: 1, totalPages: 1, totalItems: 0, hasNextPage: false, hasPreviousPage: false });",
	"export const sortCollection = (entries) => [...entries];",
	"export const reference = () => ({});",
	"export const renderEntry = async () => ({ html: '', headings: [] });",
	"export const extractHeadings = async () => [];",
	"export const createMarkdownRenderer = () => ({ render: async () => ({ html: '', headings: [] }) });",
	"export const createMdxRenderer = () => ({ render: async () => ({ html: '', headings: [] }) });",
].join("\n");

interface PluginDevServer {
	moduleGraph: {
		getModuleById(id: string): any;
		invalidateModule(mod: any): void;
	};
	ssrLoadModule(url: string): Promise<Record<string, any>>;
}

export interface ContentCollectionPluginOptions {
	/** Directory to scan for +Content.ts files, relative to project root. Defaults to "pages". */
	contentDir?: string;
	/** Directory where content files live, relative to project root.
	 *  When set, the plugin looks for files in contentRoot/<collectionName>/
	 *  instead of alongside the +Content.ts file. Defaults to the same as contentDir. */
	contentRoot?: string;
	/** Draft filtering options. */
	drafts?: {
		/** Metadata field name to check for draft status. Defaults to "draft". */
		field?: string;
		/** Force include/exclude drafts. Defaults to true in dev, false in production. */
		includeDrafts?: boolean;
	};
	/** Populate lastModified from git history on each entry. Defaults to false. */
	lastModified?: boolean;
}

const configCache = new Map<string, ResolvedContentConfig>();

export function vikeContentCollectionPlugin(
	options: ContentCollectionPluginOptions = {},
) {
	let root: string;
	let devServer: PluginDevServer | null = null;
	const store = getGlobalStore();

	function getConfigRoot(): string {
		return options.contentDir
			? resolve(root, options.contentDir)
			: resolve(root, "pages");
	}

	function getMarkdownRoot(): string {
		if (options.contentRoot) {
			return resolve(root, options.contentRoot);
		}
		return getConfigRoot();
	}

	function deriveCollectionName(configPath: string): string {
		const configDir = dirname(configPath);
		const name = relative(getConfigRoot(), configDir).replace(/\\/g, "/");
		return name || ".";
	}

	function resolveMarkdownDir(
		collectionName: string,
		contentPath?: string | null,
	): string {
		const mdRoot = getMarkdownRoot();
		if (contentPath) {
			return join(mdRoot, contentPath);
		}
		return collectionName === "." ? mdRoot : join(mdRoot, collectionName);
	}

	function isProduction(): boolean {
		return !devServer;
	}

	function shouldIncludeDrafts(): boolean {
		if (options.drafts?.includeDrafts != null) {
			return options.drafts.includeDrafts;
		}
		return !isProduction();
	}

	function getDraftField(): string {
		return options.drafts?.field ?? "draft";
	}

	function normalizeContentConfig(raw: unknown): ResolvedContentConfig {
		if (raw && typeof (raw as ZodSchema).safeParse === "function") {
			return {
				type: "content",
				schema: raw as ZodSchema,
				computed: {},
				slug: null,
				contentPath: null,
			};
		}

		const def = raw as ContentCollectionDefinition;
		if (!def || !def.schema || typeof def.schema.safeParse !== "function") {
			throw new Error(
				"Must export a zod schema via `export const Content` or `export const Content = { schema: z.object(...) }`",
			);
		}

		return {
			type: def.type ?? "content",
			schema: def.schema,
			computed: def.computed ?? {},
			slug: def.slug ?? null,
			contentPath: def.contentPath ?? null,
		};
	}

	async function loadContentConfig(
		configPath: string,
	): Promise<ResolvedContentConfig> {
		let mod: Record<string, unknown>;

		if (devServer) {
			mod = await devServer.ssrLoadModule(configPath);
		} else {
			const jiti = createJiti(root);
			mod = (await jiti.import(configPath)) as Record<string, unknown>;
		}

		const raw =
			mod.Content ??
			(mod.default as Record<string, unknown> | undefined)?.Content ??
			mod.default;

		if (!raw) {
			throw new ContentCollectionError(
				"Must export a zod schema via `export const Content`",
				configPath,
			);
		}

		const config = normalizeContentConfig(raw);
		configCache.set(configPath, config);
		return config;
	}

	function findContentFiles(dir: string, type: "content" | "data"): string[] {
		const files: string[] = [];
		if (!existsSync(dir)) return files;

		const pattern = type === "data" ? DATA_FILE_PATTERN : MARKDOWN_PATTERN;

		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				files.push(...findContentFiles(fullPath, type));
			} else if (entry.isFile() && pattern.test(entry.name)) {
				files.push(fullPath);
			}
		}
		return files;
	}

	function findContentConfigs(dir: string): string[] {
		const configs: string[] = [];
		if (!existsSync(dir)) return configs;

		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				configs.push(...findContentConfigs(fullPath));
			} else if (entry.isFile() && CONTENT_CONFIG_PATTERN.test(entry.name)) {
				configs.push(fullPath);
			}
		}
		return configs;
	}

	function deriveSlug(filePath: string): string {
		const ext = extname(filePath);
		return basename(filePath, ext);
	}

	function computeFields(
		config: ResolvedContentConfig,
		input: ComputedFieldInput,
	): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		for (const [key, fn] of Object.entries(config.computed)) {
			result[key] = fn(input);
		}
		return result;
	}

	function resolveSlug(
		config: ResolvedContentConfig,
		filePath: string,
		metadata: Record<string, unknown>,
	): string {
		const defaultSlug = deriveSlug(filePath);
		if (!config.slug) return defaultSlug;
		const input: SlugInput = { metadata, filePath, defaultSlug };
		return config.slug(input);
	}

	function buildEntry(
		filePath: string,
		config: ResolvedContentConfig,
		index: Record<string, CollectionEntry>,
	): CollectionEntry {
		const raw = readFileSync(filePath, "utf-8");

		let rawMetadata: Record<string, unknown>;
		let content: string;
		let lineMap: Record<string, number>;

		if (config.type === "data") {
			const parsed = parseDataFile(raw, filePath);
			rawMetadata = parsed.data;
			content = "";
			lineMap = {};
		} else {
			const parsed = parseMarkdownFile(raw, filePath);
			rawMetadata = parsed.metadata;
			content = parsed.content;
			lineMap = parsed.lineMap;
		}

		const validatedMetadata = validateMetadata(
			rawMetadata,
			config.schema,
			filePath,
			lineMap,
		);

		const slug = resolveSlug(config, filePath, validatedMetadata);
		const draftField = getDraftField();
		const isDraft = !!validatedMetadata[draftField];

		const computedInput: ComputedFieldInput = {
			metadata: validatedMetadata,
			content,
			filePath,
			slug,
		};
		const computed = computeFields(config, computedInput);

		const lm = options.lastModified ? getLastModified(filePath) : undefined;

		return {
			filePath,
			slug,
			metadata: validatedMetadata,
			content,
			computed,
			lastModified: lm,
			_isDraft: isDraft,
			lineMap,
			index,
		};
	}

	async function processCollection(configPath: string): Promise<void> {
		const configDir = dirname(configPath);
		const name = deriveCollectionName(configPath);
		const config = await loadContentConfig(configPath);
		const mdDir = resolveMarkdownDir(name, config.contentPath);
		const files = findContentFiles(mdDir, config.type);

		const entries: CollectionEntry[] = [];
		const index: Record<string, CollectionEntry> = {};
		const includeDrafts = shouldIncludeDrafts();

		for (const file of files) {
			const entry = buildEntry(file, config, index);
			if (!includeDrafts && entry._isDraft) continue;
			entries.push(entry);
			index[entry.slug] = entry;
		}

		store.set(configDir, {
			name,
			type: config.type,
			configDir,
			configPath,
			markdownDir: mdDir,
			entries,
		});
	}

	async function processSingleEntry(
		file: string,
		collection: {
			configDir: string;
			configPath: string;
			markdownDir: string;
			name: string;
			type: "content" | "data";
		},
	): Promise<void> {
		const config = configCache.get(collection.configPath);
		if (!config) {
			await processCollection(collection.configPath);
			return;
		}

		const existingCollection = store.get(collection.configDir);
		if (!existingCollection) return;

		const index = Object.fromEntries(
			existingCollection.entries.map((e) => [e.slug, e]),
		);

		if (!existsSync(file)) {
			const slug = deriveSlug(file);
			store.removeEntry(collection.configDir, slug);
			return;
		}

		const entry = buildEntry(file, config, index);
		const includeDrafts = shouldIncludeDrafts();

		if (!includeDrafts && entry._isDraft) {
			store.removeEntry(collection.configDir, entry.slug);
			return;
		}

		store.updateEntry(collection.configDir, entry);
	}

	async function scanAndProcess(): Promise<void> {
		store.clear();
		configCache.clear();
		const configFiles = findContentConfigs(getConfigRoot());

		for (const configPath of configFiles) {
			const configDir = dirname(configPath);
			const name = deriveCollectionName(configPath);
			const markdownDir = resolveMarkdownDir(name);
			store.set(configDir, {
				name,
				type: "content",
				configDir,
				configPath,
				markdownDir,
				entries: [],
			});
		}

		generateDeclarationFile(store, root);

		for (const configPath of configFiles) {
			try {
				await processCollection(configPath);
			} catch (error) {
				const name = deriveCollectionName(configPath);
				console.error(
					`[vike-content-collection] Failed to process collection "${name}":`,
					error instanceof Error ? error.message : error,
				);
			}
		}

		validateReferences(store);
	}

	return {
		name: "vike-content-collection",
		enforce: "pre" as const,

		configResolved(resolvedConfig: { root: string }) {
			root = resolvedConfig.root;
		},

		configureServer(server: PluginDevServer) {
			devServer = server;
		},

		async buildStart() {
			await scanAndProcess();
		},

		resolveId(
			id: string,
			_importer: string | undefined,
			options?: { ssr?: boolean },
		) {
			if (id === VIRTUAL_MODULE_ID) {
				return RESOLVED_VIRTUAL_MODULE_ID;
			}
			if (id === "vike-content-collection" && !options?.ssr) {
				return NOOP_MODULE_ID;
			}
		},

		load(id: string) {
			if (id === RESOLVED_VIRTUAL_MODULE_ID) {
				const data = store.toSerializable();
				return `export const collections = ${JSON.stringify(data, null, 2)};`;
			}
			if (id === NOOP_MODULE_ID) {
				return CLIENT_NOOP_CODE;
			}
		},

		async handleHotUpdate({
			file,
			server,
		}: {
			file: string;
			server: PluginDevServer;
		}) {
			const isMarkdown = MARKDOWN_PATTERN.test(file);
			const isDataFile = DATA_FILE_PATTERN.test(file);
			const isContentConfig = CONTENT_CONFIG_PATTERN.test(file);

			if (!isMarkdown && !isDataFile && !isContentConfig) return;

			try {
				if (isContentConfig) {
					const configDir = dirname(file);
					const name = deriveCollectionName(file);
					if (!store.has(configDir)) {
						const markdownDir = resolveMarkdownDir(name);
						store.set(configDir, {
							name,
							type: "content",
							configDir,
							configPath: file,
							markdownDir,
							entries: [],
						});
					}
					configCache.delete(file);
					await processCollection(file);
				} else if (isMarkdown || isDataFile) {
					for (const collection of store.getAll()) {
						if (file.startsWith(collection.markdownDir)) {
							await processSingleEntry(file, collection);
							break;
						}
					}
				}
			} catch (error) {
				console.error(
					`[vike-content-collection] HMR processing failed for "${file}":`,
					error instanceof Error ? error.message : error,
				);
			}

			validateReferences(store);
			generateDeclarationFile(store, root);

			const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
			if (mod) {
				server.moduleGraph.invalidateModule(mod);
				return [mod];
			}
		},
	};
}
