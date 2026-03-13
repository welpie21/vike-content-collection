import { access, readdir, readFile } from "node:fs/promises";
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
import { getLastModifiedBatch } from "./git.js";
import { parseMarkdownFile } from "./markdown.js";
import { validateReferenceFields } from "./reference-validator.js";
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
	let jitiInstance: ReturnType<typeof createJiti> | null = null;
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
			if (!jitiInstance) jitiInstance = createJiti(root);
			mod = (await jitiInstance.import(configPath)) as Record<string, unknown>;
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

	async function findContentFiles(
		dir: string,
		type: "content" | "data",
	): Promise<string[]> {
		try {
			await access(dir);
		} catch {
			return [];
		}

		const pattern = type === "data" ? DATA_FILE_PATTERN : MARKDOWN_PATTERN;
		const entries = await readdir(dir, { withFileTypes: true });

		const nested = await Promise.all(
			entries.map(async (entry) => {
				const fullPath = join(dir, entry.name);
				if (entry.isDirectory()) {
					return findContentFiles(fullPath, type);
				}
				if (entry.isFile() && pattern.test(entry.name)) {
					return [fullPath];
				}
				return [];
			}),
		);

		return nested.flat();
	}

	async function findContentConfigs(dir: string): Promise<string[]> {
		try {
			await access(dir);
		} catch {
			return [];
		}

		const entries = await readdir(dir, { withFileTypes: true });

		const nested = await Promise.all(
			entries.map(async (entry) => {
				const fullPath = join(dir, entry.name);
				if (entry.isDirectory()) {
					return findContentConfigs(fullPath);
				}
				if (entry.isFile() && CONTENT_CONFIG_PATTERN.test(entry.name)) {
					return [fullPath];
				}
				return [];
			}),
		);

		return nested.flat();
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

	async function buildEntry(
		filePath: string,
		config: ResolvedContentConfig,
		lastModifiedMap?: Map<string, Date | undefined>,
	): Promise<CollectionEntry> {
		const raw = await readFile(filePath, "utf-8");

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

		const lm = lastModifiedMap?.get(filePath);

		return {
			filePath,
			slug,
			metadata: validatedMetadata,
			content,
			computed,
			lastModified: lm,
			_isDraft: isDraft,
			lineMap,
			index: {},
		};
	}

	async function processCollection(configPath: string): Promise<void> {
		const configDir = dirname(configPath);
		const name = deriveCollectionName(configPath);
		const config = await loadContentConfig(configPath);
		const mdDir = resolveMarkdownDir(name, config.contentPath);
		const files = await findContentFiles(mdDir, config.type);

		let lastModifiedMap: Map<string, Date | undefined> | undefined;
		if (options.lastModified && files.length > 0) {
			lastModifiedMap = await getLastModifiedBatch(files, root);
		}

		const allEntries = await Promise.all(
			files.map((file) => buildEntry(file, config, lastModifiedMap)),
		);

		const entries: CollectionEntry[] = [];
		const index: Record<string, CollectionEntry> = {};
		const includeDrafts = shouldIncludeDrafts();

		for (const entry of allEntries) {
			if (!includeDrafts && entry._isDraft) continue;
			entries.push(entry);
			index[entry.slug] = entry;
			entry.index = index;
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

		try {
			await access(file);
		} catch {
			const slug = deriveSlug(file);
			store.removeEntry(collection.configDir, slug);
			return;
		}

		let lastModifiedMap: Map<string, Date | undefined> | undefined;
		if (options.lastModified) {
			lastModifiedMap = await getLastModifiedBatch([file], root);
		}

		const entry = await buildEntry(file, config, lastModifiedMap);
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
		jitiInstance = null;
		const configFiles = await findContentConfigs(getConfigRoot());

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

		await generateDeclarationFile(store, root);

		await Promise.allSettled(
			configFiles.map(async (configPath) => {
				try {
					await processCollection(configPath);
				} catch (error) {
					const name = deriveCollectionName(configPath);
					console.error(
						`[vike-content-collection] Failed to process collection "${name}":`,
						error instanceof Error ? error.message : error,
					);
				}
			}),
		);

		const schemaMap = new Map<string, unknown>();
		for (const [path, config] of configCache.entries()) {
			schemaMap.set(path, config.schema);
		}
		validateReferenceFields(store, schemaMap);
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

			const schemaMap = new Map<string, unknown>();
			for (const [path, config] of configCache.entries()) {
				schemaMap.set(path, config.schema);
			}
			validateReferenceFields(store, schemaMap);
			await generateDeclarationFile(store, root);

			const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
			if (mod) {
				server.moduleGraph.invalidateModule(mod);
				return [mod];
			}
		},
	};
}
