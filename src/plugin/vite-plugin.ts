import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createJiti } from "jiti";
import type { ZodSchema } from "zod";
import { type CollectionEntry, getGlobalStore } from "./collection-store.js";
import { ContentCollectionError } from "./errors.js";
import { generateDeclarationFile } from "./generate-types.js";
import { parseMarkdownFile } from "./markdown.js";
import { validateFrontmatter } from "./validation.js";

const VIRTUAL_MODULE_ID = "virtual:content-collection";
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;
const CONTENT_CONFIG_PATTERN = /\+Content\.(ts|js|mts|mjs)$/;

interface ViteDevServer {
	moduleGraph: {
		getModuleById(id: string): unknown;
		invalidateModule(mod: unknown): void;
	};
	ssrLoadModule(url: string): Promise<Record<string, unknown>>;
}

export interface ContentCollectionPluginOptions {
	/** Directory to scan for +Content.ts files, relative to project root. Defaults to "pages". */
	contentDir?: string;
	/** Directory where markdown content files live, relative to project root.
	 *  When set, the plugin looks for .md files in contentRoot/<collectionName>/
	 *  instead of alongside the +Content.ts file. Defaults to the same as contentDir. */
	contentRoot?: string;
}

export function vikeContentCollectionPlugin(
	options: ContentCollectionPluginOptions = {},
) {
	let root: string;
	let devServer: ViteDevServer | null = null;
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

	function resolveMarkdownDir(collectionName: string): string {
		const mdRoot = getMarkdownRoot();
		return collectionName === "." ? mdRoot : join(mdRoot, collectionName);
	}

	async function loadSchema(configPath: string): Promise<ZodSchema> {
		let mod: Record<string, unknown>;

		if (devServer) {
			mod = await devServer.ssrLoadModule(configPath);
		} else {
			const jiti = createJiti(root);
			mod = (await jiti.import(configPath)) as Record<string, unknown>;
		}

		const schema =
			mod.Content ??
			(mod.default as Record<string, unknown> | undefined)?.Content ??
			mod.default;

		if (!schema || typeof (schema as ZodSchema).safeParse !== "function") {
			throw new ContentCollectionError(
				"Must export a zod schema via `export const Content`",
				configPath,
			);
		}
		return schema as ZodSchema;
	}

	function findMarkdownFiles(dir: string): string[] {
		const files: string[] = [];
		if (!existsSync(dir)) return files;

		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				files.push(...findMarkdownFiles(fullPath));
			} else if (entry.isFile() && /\.md$/i.test(entry.name)) {
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

	async function processCollection(configPath: string): Promise<void> {
		const configDir = dirname(configPath);
		const name = deriveCollectionName(configPath);
		const schema = await loadSchema(configPath);
		const mdDir = resolveMarkdownDir(name);
		const mdFiles = findMarkdownFiles(mdDir);

		const entries: CollectionEntry[] = [];

		for (const mdFile of mdFiles) {
			const raw = readFileSync(mdFile, "utf-8");
			const parsed = parseMarkdownFile(raw, mdFile);
			const validatedFrontmatter = validateFrontmatter(
				parsed.frontmatter,
				schema,
				mdFile,
				parsed.lineMap,
			);
			entries.push({
				filePath: mdFile,
				frontmatter: validatedFrontmatter,
				content: parsed.content,
				lineMap: parsed.lineMap,
			});
		}

		store.set(configDir, { name, configDir, configPath, markdownDir: mdDir, entries });
	}

	async function scanAndProcess(): Promise<void> {
		store.clear();
		const configFiles = findContentConfigs(getConfigRoot());

		for (const configPath of configFiles) {
			const configDir = dirname(configPath);
			const name = deriveCollectionName(configPath);
			const markdownDir = resolveMarkdownDir(name);
			store.set(configDir, { name, configDir, configPath, markdownDir, entries: [] });
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
	}

	return {
		name: 'vike-content-collection',
		enforce: 'pre' as const,

		configResolved(resolvedConfig: { root: string }) {
			root = resolvedConfig.root;
		},

		configureServer(server: ViteDevServer) {
			devServer = server;
		},

		async buildStart() {
			await scanAndProcess();
		},

		resolveId(id: string) {
			if (id === VIRTUAL_MODULE_ID) {
				return RESOLVED_VIRTUAL_MODULE_ID;
			}
		},

		load(id: string) {
			if (id === RESOLVED_VIRTUAL_MODULE_ID) {
				const data = store.toSerializable();
				return `export const collections = ${JSON.stringify(data, null, 2)};`;
			}
		},

		async handleHotUpdate({ file, server }: { file: string; server: ViteDevServer }) {
			const isMarkdown = /\.md$/i.test(file);
			const isContentConfig = CONTENT_CONFIG_PATTERN.test(file);

			if (!isMarkdown && !isContentConfig) return;

			try {
				if (isContentConfig) {
					const configDir = dirname(file);
					const name = deriveCollectionName(file);
					if (!store.has(configDir)) {
						const markdownDir = resolveMarkdownDir(name);
						store.set(configDir, { name, configDir, configPath: file, markdownDir, entries: [] });
					}
					await processCollection(file);
				} else if (isMarkdown) {
					for (const collection of store.getAll()) {
						if (file.startsWith(collection.markdownDir)) {
							await processCollection(collection.configPath);
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

			generateDeclarationFile(store, root);

			const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
			if (mod) {
				server.moduleGraph.invalidateModule(mod);
				return [mod];
			}
		},
	};
}
