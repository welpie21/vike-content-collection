import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin, ResolvedConfig } from "vite";
import type { ZodSchema } from "zod";
import { type CollectionEntry, getGlobalStore } from "./collection-store.js";
import { ContentCollectionError } from "./errors.js";
import { generateDeclarationFile } from "./generate-types.js";
import { parseMarkdownFile } from "./markdown.js";
import { validateFrontmatter } from "./validation.js";

const VIRTUAL_MODULE_ID = "virtual:content-collection";
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;
const CONTENT_CONFIG_PATTERN = /\+Content\.(ts|js|mts|mjs)$/;

export interface ContentCollectionPluginOptions {
	/** Directory to scan for +Content.ts files, relative to project root. Defaults to "pages". */
	contentDir?: string;
}

export function vikeContentCollectionPlugin(
	options: ContentCollectionPluginOptions = {},
): Plugin {
	let config: ResolvedConfig;
	let root: string;
	const store = getGlobalStore();

	function getContentRoot(): string {
		return options.contentDir
			? resolve(root, options.contentDir)
			: resolve(root, "pages");
	}

	function deriveCollectionName(configPath: string): string {
		const configDir = dirname(configPath);
		const name = relative(getContentRoot(), configDir).replace(/\\/g, "/");
		return name || ".";
	}

	async function loadSchema(configPath: string): Promise<ZodSchema> {
		const fileUrl = pathToFileURL(configPath).href;
		const timestamp = Date.now();
		const mod = await import(`${fileUrl}?t=${timestamp}`);
		const schema = mod.schema ?? mod.default?.schema ?? mod.default;
		if (!schema || typeof schema.safeParse !== "function") {
			throw new ContentCollectionError(
				"Must export a zod schema via `export const schema`",
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
		const mdFiles = findMarkdownFiles(configDir);

		const entries: CollectionEntry[] = [];
		const index: Record<string, CollectionEntry> = {};

		for (const mdFile of mdFiles) {
			const raw = readFileSync(mdFile, "utf-8");
			const slug = basename(mdFile).replace(/\.\w+$/, "");
			const parsed = parseMarkdownFile(raw, mdFile);
			const validatedFrontmatter = validateFrontmatter(
				parsed.frontmatter,
				schema,
				mdFile,
				parsed.lineMap,
			);

			const entry: CollectionEntry = {
				slug,
				filePath: mdFile,
				frontmatter: validatedFrontmatter,
				content: parsed.content,
				lineMap: parsed.lineMap,
			};

			entries.push(entry);
			index[slug] = entry;
		}

		store.set(configDir, { name, configDir, configPath, entries, index });
	}

	async function scanAndProcess(): Promise<void> {
		store.clear();
		const configFiles = findContentConfigs(getContentRoot());
		for (const configPath of configFiles) {
			await processCollection(configPath);
		}
		generateDeclarationFile(store, root);
	}

	return {
		name: "vike-content-collection",
		enforce: "pre",

		configResolved(resolvedConfig) {
			config = resolvedConfig;
			root = config.root;
		},

		async buildStart() {
			await scanAndProcess();
		},

		resolveId(id) {
			if (id === VIRTUAL_MODULE_ID) {
				return RESOLVED_VIRTUAL_MODULE_ID;
			}
		},

		load(id) {
			if (id === RESOLVED_VIRTUAL_MODULE_ID) {
				const data = store.toSerializable();
				return `export const collections = ${JSON.stringify(data, null, 2)};`;
			}
		},

		async handleHotUpdate({ file, server }) {
			const isMarkdown = /\.md$/i.test(file);
			const isContentConfig = CONTENT_CONFIG_PATTERN.test(file);

			if (!isMarkdown && !isContentConfig) return;

			if (isContentConfig) {
				await processCollection(file);
			} else if (isMarkdown) {
				for (const collection of store.getAll()) {
					if (file.startsWith(collection.configDir)) {
						await processCollection(collection.configPath);
						break;
					}
				}
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
