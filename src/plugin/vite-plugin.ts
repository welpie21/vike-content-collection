import { type Plugin, type ResolvedConfig } from 'vite'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, dirname, relative, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ZodSchema } from 'zod'
import { parseMarkdownFile } from './markdown.js'
import { validateFrontmatter } from './validation.js'
import { CollectionStore, type CollectionEntry } from './collection-store.js'
import { ContentCollectionError } from './errors.js'

const VIRTUAL_MODULE_ID = 'virtual:content-collection'
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID
const CONTENT_CONFIG_PATTERN = /\+Content\.(ts|js|mts|mjs)$/

export interface ContentCollectionPluginOptions {
  /** Glob patterns for directories to scan. Defaults to pages directory. */
  contentDir?: string
}

export function vikeContentCollectionPlugin(
  options: ContentCollectionPluginOptions = {},
): Plugin {
  let config: ResolvedConfig
  let root: string
  const store = new CollectionStore()

  async function loadSchema(configPath: string): Promise<ZodSchema> {
    const fileUrl = pathToFileURL(configPath).href
    const timestamp = Date.now()
    const mod = await import(`${fileUrl}?t=${timestamp}`)
    const schema = mod.schema ?? mod.default?.schema ?? mod.default
    if (!schema || typeof schema.safeParse !== 'function') {
      throw new ContentCollectionError(
        'Must export a zod schema as `schema` or as default export',
        configPath,
      )
    }
    return schema as ZodSchema
  }

  function findMarkdownFiles(dir: string): string[] {
    const files: string[] = []
    if (!existsSync(dir)) return files

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...findMarkdownFiles(fullPath))
      } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        files.push(fullPath)
      }
    }
    return files
  }

  function findContentConfigs(dir: string): string[] {
    const configs: string[] = []
    if (!existsSync(dir)) return configs

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        configs.push(...findContentConfigs(fullPath))
      } else if (entry.isFile() && CONTENT_CONFIG_PATTERN.test(entry.name)) {
        configs.push(fullPath)
      }
    }
    return configs
  }

  async function processCollection(configPath: string): Promise<void> {
    const configDir = dirname(configPath)
    const schema = await loadSchema(configPath)
    const mdFiles = findMarkdownFiles(configDir)

    const entries: CollectionEntry[] = []

    for (const mdFile of mdFiles) {
      const raw = readFileSync(mdFile, 'utf-8')
      const parsed = parseMarkdownFile(raw, mdFile)
      const validatedFrontmatter = validateFrontmatter(
        parsed.frontmatter,
        schema,
        mdFile,
        parsed.lineMap,
      )
      entries.push({
        filePath: mdFile,
        frontmatter: validatedFrontmatter,
        content: parsed.content,
        lineMap: parsed.lineMap,
      })
    }

    store.set(configDir, { configDir, configPath, entries })
  }

  async function scanAndProcess(): Promise<void> {
    store.clear()
    const scanDir = options.contentDir
      ? resolve(root, options.contentDir)
      : resolve(root, 'pages')

    const configFiles = findContentConfigs(scanDir)
    for (const configPath of configFiles) {
      await processCollection(configPath)
    }
  }

  return {
    name: 'vike-content-collection',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      config = resolvedConfig
      root = config.root
    },

    async buildStart() {
      await scanAndProcess()
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        const data = store.toSerializable()
        return `export const collections = ${JSON.stringify(data, null, 2)};`
      }
    },

    async handleHotUpdate({ file, server }) {
      const isMarkdown = /\.md$/i.test(file)
      const isContentConfig = CONTENT_CONFIG_PATTERN.test(file)

      if (!isMarkdown && !isContentConfig) return

      if (isContentConfig) {
        await processCollection(file)
      } else if (isMarkdown) {
        for (const collection of store.getAll()) {
          if (file.startsWith(collection.configDir)) {
            await processCollection(collection.configPath)
            break
          }
        }
      }

      const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID)
      if (mod) {
        server.moduleGraph.invalidateModule(mod)
        return [mod]
      }
    },
  }
}
