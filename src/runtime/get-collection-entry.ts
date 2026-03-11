import { getGlobalStore } from "../plugin/collection-store.js";
import type { CollectionMap, TypedCollectionEntry } from "../types/index.js";

/**
 * Retrieve a content entry from a collection by name and slug with full type safety.
 *
 * The name corresponds to the directory path (relative to the content root)
 * that contains the `+Content.ts` config file.
 * 
 * The slug corresponds to the name of the content file (without the extension).
 *
 * When a generated declaration file augments `CollectionMap`, the return type
 * is automatically inferred from the zod schema in `+Content.ts`.
 */
export function getCollectionEntry<K extends keyof CollectionMap, S extends CollectionMap[K]>(
	name: K,
	slug: S,
): TypedCollectionEntry<CollectionMap[K][S]>;
export function getCollectionEntry(
	name: string,
	slug: string,
): TypedCollectionEntry<Record<string, unknown>>;
export function getCollectionEntry(
	name: string,
	slug: string,
): TypedCollectionEntry<Record<string, unknown>> {
	const store = getGlobalStore();
	const collection = store.getByName(name);

	if (!collection) {
		const available = store
			.getAll()
			.map((c) => `"${c.name}"`)
			.join(", ");
		throw new Error(
			`[vike-content-collection] Collection "${name}" not found. ` +
				`Available collections: ${available || "(none)"}`,
		);
	}

	const entry = collection.index[slug];

	if (!entry) {
		throw new Error(
			`[vike-content-collection] Entry with slug "${slug}" not found in collection "${name}".`,
		);
	}

	return {
		slug: entry.slug,
		filePath: entry.filePath,
		frontmatter: entry.frontmatter,
		content: entry.content,
	};
}
