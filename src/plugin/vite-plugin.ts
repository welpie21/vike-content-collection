import { readFileSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
	"export const findCollectionEntries = () => [];",
	"export const paginate = (_entries, _options) => ({ items: [], currentPage: 1, totalPages: 1, totalItems: 0, hasNextPage: false, hasPreviousPage: false });",
	"export const sortCollection = (entries) => [...entries];",
	"export const reference = () => ({});",
	"export const renderEntry = async () => ({ html: '', headings: [] });",
	"export const extractHeadings = async () => [];",
	"export const createMarkdownRenderer = () => ({ render: async () => ({ html: '', headings: [] }) });",
	"export const createMdxRenderer = () => ({ render: async () => ({ html: '', headings: [] }) });",
	"export const groupBy = () => new Map();",
	"export const getBreadcrumbs = () => [];",
	"export const getAdjacentEntries = () => ({ prev: undefined, next: undefined });",
	"export const getCollectionTree = () => [];",
	"export const buildTocTree = () => [];",
	"export const getRelatedEntries = () => [];",
	"export const mergeCollections = () => [];",
	"export const uniqueValues = () => [];",
	"export const getEntryUrl = () => '/';",
	"export const getSeries = () => undefined;",
	"export const getAvailableLocales = () => [];",
	"export const getLocalizedEntry = () => undefined;",
].join("\n");

interface PluginDevServer {
	moduleGraph: {
		getModuleById(id: string): any;
		invalidateModule(mod: any): void;
	};
	ssrLoadModule(url: string): Promise<Record<string, any>>;
	hot: {
		send(payload: {
			type: string;
			path?: string;
			[key: string]: unknown;
		}): void;
	};
	watcher: {
		on(event: string, handler: (path: string) => void): void;
	};
}

export interface ContentCollectionPluginOptions {
	/** Directory to scan for +Content.ts files, relative to project root. Defaults to "pages". */
	contentDir?: string;
	/** Directory where content files live, relative to project root.
	 *  When set, the plugin looks for files in contentRoot/<collectionName>/
	 *  instead of alongside the +Content.ts file. Defaults to the same as contentDir. */
	contentRoot?: string;
	/** Output directory for the generated TypeScript declaration file, relative to project root.
	 *  Defaults to ".vike-content-collection". */
	declarationOutDir?: string;
	/** Filename for the generated TypeScript declaration file. Defaults to "types.d.ts". */
	declarationFileName?: string;
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

/** @internal Strips JSONC comments and trailing commas for tsconfig parsing. */
export function stripJsonc(text: string): string {
	let result = "";
	let inString = false;
	let isEscaped = false;
	let i = 0;

	while (i < text.length) {
		const ch = text[i];

		if (isEscaped) {
			result += ch;
			isEscaped = false;
			i++;
			continue;
		}

		if (inString) {
			if (ch === "\\") isEscaped = true;
			else if (ch === '"') inString = false;
			result += ch;
			i++;
			continue;
		}

		if (ch === '"') {
			inString = true;
			result += ch;
			i++;
			continue;
		}

		if (ch === "/" && text[i + 1] === "/") {
			const nl = text.indexOf("\n", i);
			i = nl === -1 ? text.length : nl;
			continue;
		}

		if (ch === "/" && text[i + 1] === "*") {
			const end = text.indexOf("*/", i + 2);
			i = end === -1 ? text.length : end + 2;
			continue;
		}

		result += ch;
		i++;
	}

	return result.replace(/,(\s*[}\]])/g, "$1");
}

/** @internal Reads tsconfig.json paths and converts them to resolve aliases. */
export function loadTsconfigAliases(
	projectRoot: string,
): Record<string, string> {
	const aliases: Record<string, string> = {};

	function readConfig(
		filePath: string,
		depth: number,
	): { baseUrl?: string; paths?: Record<string, string[]> } {
		if (depth > 5) return {};

		let raw: string;
		try {
			raw = readFileSync(filePath, "utf-8");
		} catch {
			return {};
		}

		let config: Record<string, unknown>;
		try {
			config = JSON.parse(stripJsonc(raw));
		} catch {
			return {};
		}

		const compiler = (config.compilerOptions ?? {}) as Record<string, unknown>;
		let merged = { baseUrl: compiler.baseUrl, paths: compiler.paths } as {
			baseUrl?: string;
			paths?: Record<string, string[]>;
		};

		if (typeof config.extends === "string" && config.extends.startsWith(".")) {
			const dir = dirname(filePath);
			let parentPath = resolve(dir, config.extends);
			if (!parentPath.endsWith(".json")) parentPath += ".json";
			const parent = readConfig(parentPath, depth + 1);
			merged = {
				baseUrl: merged.baseUrl ?? parent.baseUrl,
				paths:
					merged.paths && parent.paths
						? { ...parent.paths, ...merged.paths }
						: (merged.paths ?? parent.paths),
			};
		}

		return merged;
	}

	const config = readConfig(join(projectRoot, "tsconfig.json"), 0);
	const baseUrl = resolve(projectRoot, (config.baseUrl as string) ?? ".");
	const paths = config.paths ?? {};

	for (const [pattern, targets] of Object.entries(paths)) {
		if (!Array.isArray(targets) || targets.length === 0) continue;
		const aliasKey = pattern.endsWith("/*") ? pattern.slice(0, -2) : pattern;
		const target = targets[0];
		const aliasValue = target.endsWith("/*") ? target.slice(0, -2) : target;
		aliases[aliasKey] = resolve(baseUrl, aliasValue);
	}

	return aliases;
}

const configCache = new Map<string, ResolvedContentConfig>();

export function vikeContentCollectionPlugin(
	options: ContentCollectionPluginOptions = {},
) {
	let root: string;
	let devServer: PluginDevServer | null = null;
	let buildServer: PluginDevServer | null = null;
	let viteAliases: Record<string, string> = {};
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

	function isInsideDir(filePath: string, dir: string): boolean {
		return filePath === dir || filePath.startsWith(`${dir}/`);
	}

	function findCollectionForFile(file: string) {
		for (const collection of store.getAll()) {
			if (isInsideDir(file, collection.markdownDir)) {
				return collection;
			}
		}
		return null;
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

	async function ensureBuildServer(): Promise<PluginDevServer> {
		if (!buildServer) {
			const { register } = await import("node:module");
			register(
				`data:text/javascript,${encodeURIComponent(
					"export function load(u,c,n){" +
						"if(/\\.(webp|png|jpe?g|gif|svg|ico|avif|css|scss|sass|less|styl|woff2?|eot|ttf|otf|mp[34]|webm|ogg|wav|pdf)(\\?|$)/i.test(u))" +
						'return{shortCircuit:true,format:"module",source:\'export default "";\'};' +
						"return n(u,c)}",
				)}`,
				import.meta.url,
			);

			const { createServer } = await import("vite");
			const aliasEntries = Object.entries(viteAliases).map(
				([find, replacement]) => ({ find, replacement }),
			);
			buildServer = (await createServer({
				root,
				configFile: false,
				logLevel: "silent",
				server: { middlewareMode: true },
				resolve: aliasEntries.length > 0 ? { alias: aliasEntries } : undefined,
			})) as unknown as PluginDevServer;
		}
		return buildServer;
	}

	async function closeBuildServer(): Promise<void> {
		if (buildServer) {
			await (buildServer as unknown as { close(): Promise<void> }).close();
			buildServer = null;
		}
	}

	async function loadContentConfig(
		configPath: string,
	): Promise<ResolvedContentConfig> {
		let mod: Record<string, unknown>;

		if (devServer) {
			mod = await devServer.ssrLoadModule(configPath);
		} else {
			const server = await ensureBuildServer();
			mod = await server.ssrLoadModule(configPath);
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
		const index: Map<string, CollectionEntry> = new Map();
		const includeDrafts = shouldIncludeDrafts();

		for (const entry of allEntries) {
			if (!includeDrafts && entry._isDraft) continue;
			entries.push(entry);
			index.set(entry.slug, entry);
		}

		store.set(configDir, {
			name,
			type: config.type,
			configDir,
			configPath,
			markdownDir: mdDir,
			entries,
			index,
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
				index: new Map(),
			});
		}

		await generateDeclarationFile(
			store,
			root,
			options.declarationOutDir,
			options.declarationFileName,
		);

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

		await closeBuildServer();

		const schemaMap = new Map<string, unknown>();
		for (const [path, config] of configCache.entries()) {
			schemaMap.set(path, config.schema);
		}
		validateReferenceFields(store, schemaMap);
	}

	function invalidateVirtualModule(server: PluginDevServer): void {
		const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
		if (mod) {
			server.moduleGraph.invalidateModule(mod);
		}
		server.hot.send({ type: "full-reload" });
	}

	return {
		name: "vike-content-collection",
		enforce: "pre" as const,

		configResolved(resolvedConfig: {
			root: string;
			command: string;
			resolve?: {
				alias?: Array<{
					find: string | RegExp;
					replacement: string;
				}>;
			};
		}) {
			root = resolvedConfig.root;

			const tsconfigAliases = loadTsconfigAliases(root);
			const resolvedAliases: Record<string, string> = { ...tsconfigAliases };
			const aliases = resolvedConfig.resolve?.alias;
			if (Array.isArray(aliases)) {
				for (const entry of aliases) {
					if (typeof entry.find === "string") {
						resolvedAliases[entry.find] = entry.replacement;
					}
				}
			}
			viteAliases = resolvedAliases;
		},

		configureServer(server: PluginDevServer) {
			devServer = server;

			function handleFileChange(file: string) {
				const isContentFile =
					MARKDOWN_PATTERN.test(file) || DATA_FILE_PATTERN.test(file);
				const isConfig = CONTENT_CONFIG_PATTERN.test(file);
				if (!isContentFile && !isConfig) return;

				const collection = isContentFile ? findCollectionForFile(file) : null;
				if (isContentFile && !collection) return;

				(async () => {
					try {
						if (isConfig) {
							await processCollection(file);
						} else if (collection) {
							await processSingleEntry(file, collection);
						}
					} catch (error) {
						console.error(
							`[vike-content-collection] Failed to process "${file}":`,
							error instanceof Error ? error.message : error,
						);
					}
					await generateDeclarationFile(
						store,
						root,
						options.declarationOutDir,
						options.declarationFileName,
					);
					invalidateVirtualModule(server);
				})();
			}

			server.watcher.on("add", handleFileChange);
			server.watcher.on("unlink", handleFileChange);
		},

		async buildStart() {
			const alreadyPopulated = store.getAll().some((c) => c.entries.length > 0);
			if (alreadyPopulated) return;
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
				let hasCircular = false;
				const ancestors: unknown[] = [];
				const json = JSON.stringify(
					data,
					function (_key, value) {
						if (typeof value === "object" && value !== null) {
							const thisIdx = ancestors.indexOf(this);
							if (thisIdx !== -1) {
								ancestors.length = thisIdx + 1;
							}
							if (ancestors.includes(value)) {
								hasCircular = true;
								return null;
							}
							ancestors.push(value);
						}
						return value;
					},
					2,
				);
				if (hasCircular) {
					console.warn(
						"[vike-content-collection] Circular reference detected in collection data. " +
							"Check computed fields or schema transforms that may embed other entries.",
					);
				}

				if (!isProduction()) {
					return `export const collections = ${json};`;
				}

				const collectionStorePath = fileURLToPath(
					new URL("./collection-store.js", import.meta.url),
				);

				const imports: string[] = [
					`import { hydrateGlobalStore as _hydrate } from ${JSON.stringify(collectionStorePath)};`,
				];
				const configEntries: string[] = [];
				let idx = 0;
				for (const collection of store.getAll()) {
					const varName = `_c${idx++}`;
					imports.push(
						`import { Content as ${varName} } from ${JSON.stringify(collection.configPath)};`,
					);
					configEntries.push(
						`  ${JSON.stringify(collection.configDir)}: ${varName},`,
					);
				}

				const recomputeCode = [
					...imports,
					"",
					`_hydrate(${json});`,
					"",
					'const _STORE_KEY = Symbol.for("vike-content-collection:store");',
					`const _configs = {\n${configEntries.join("\n")}\n};`,
					"",
					"function _extractComputed(raw) {",
					"  if (!raw) return {};",
					"  if (typeof raw.safeParse === 'function') return {};",
					"  return raw.computed || {};",
					"}",
					"",
					"const _store = globalThis[_STORE_KEY];",
					"if (_store) {",
					"  for (const [configDir, raw] of Object.entries(_configs)) {",
					"    const col = _store.get(configDir);",
					"    if (!col) continue;",
					"    const fns = _extractComputed(raw);",
					"    if (Object.keys(fns).length === 0) continue;",
					"    const entries = col.entries.map(entry => {",
					"      const computed = {};",
					"      for (const [key, fn] of Object.entries(fns)) {",
					"        try { computed[key] = fn({ metadata: entry.metadata, content: entry.content, filePath: entry.filePath, slug: entry.slug }); }",
					"        catch { computed[key] = undefined; }",
					"      }",
					"      return { ...entry, computed };",
					"    });",
					"    const index = new Map(entries.map(e => [e.slug, e]));",
					"    _store.set(configDir, { ...col, entries, index });",
					"  }",
					"}",
					"",
					`export const collections = ${json};`,
				];

				return recomputeCode.join("\n");
			}
			if (id === NOOP_MODULE_ID) {
				return CLIENT_NOOP_CODE;
			}
		},

		transform(code: string, id: string, options?: { ssr?: boolean }) {
			if (!isProduction()) return;
			if (!options?.ssr) return;
			if (id.includes("node_modules")) return;
			if (id === RESOLVED_VIRTUAL_MODULE_ID) return;
			if (
				/from\s+["']vike-content-collection["']/.test(code) ||
				/import\s*\(\s*["']vike-content-collection["']\s*\)/.test(code)
			) {
				return {
					code: `import "${VIRTUAL_MODULE_ID}";\n${code}`,
					map: null,
				};
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
							index: new Map(),
						});
					}

					configCache.delete(file);
					await processCollection(file);
				} else if (isMarkdown || isDataFile) {
					const collection = findCollectionForFile(file);

					if (collection) {
						await processSingleEntry(file, collection);
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
			await generateDeclarationFile(
				store,
				root,
				options.declarationOutDir,
				options.declarationFileName,
			);

			invalidateVirtualModule(server);
			return [];
		},
	};
}
