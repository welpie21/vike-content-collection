import { getGlobalStore } from '../plugin/collection-store.js'
import type { CollectionMap, TypedCollectionEntry } from '../types/index.js'

/**
 * Retrieve a content collection by name with full type safety.
 *
 * The name corresponds to the directory path (relative to the content root)
 * that contains the `+Content.ts` config file.
 *
 * When a generated declaration file augments `CollectionMap`, the return type
 * is automatically inferred from the zod schema in `+Content.ts`.
 */
export function getCollection<K extends keyof CollectionMap>(
  name: K,
): TypedCollectionEntry<CollectionMap[K]>[]
export function getCollection(
  name: string,
): TypedCollectionEntry<Record<string, unknown>>[]
export function getCollection(
  name: string,
): TypedCollectionEntry<Record<string, unknown>>[] {
  const store = getGlobalStore()
  const collection = store.getByName(name)

  if (!collection) {
    const available = store
      .getAll()
      .map((c) => `"${c.name}"`)
      .join(', ')
    throw new Error(
      `[vike-content-collection] Collection "${name}" not found. ` +
        `Available collections: ${available || '(none)'}`,
    )
  }

  return collection.entries.map((entry) => ({
    filePath: entry.filePath,
    frontmatter: entry.frontmatter,
    content: entry.content,
  }))
}
