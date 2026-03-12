import { basename } from "node:path";
import { getGlobalStore } from "../plugin/collection-store.js";
import type { CollectionMap, TypedCollectionEntry } from "../types/index.js";

function resolveCollection(name: string) {
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

	return collection;
}

function toTypedEntry<T>(entry: {
	filePath: string;
	frontmatter: Record<string, unknown>;
	content: string;
}): TypedCollectionEntry<T> {
	return {
		filePath: entry.filePath,
		frontmatter: entry.frontmatter as T,
		content: entry.content,
	};
}

/**
 * Retrieve all entries of a content collection by name.
 *
 * The name corresponds to the directory path (relative to the content root)
 * that contains the `+Content.ts` config file.
 *
 * When a generated declaration file augments `CollectionMap`, the return type
 * is automatically inferred from the zod schema in `+Content.ts`.
 */
export function getCollection<K extends keyof CollectionMap>(
	name: K,
): TypedCollectionEntry<CollectionMap[K]>[];
export function getCollection(
	name: string,
): TypedCollectionEntry<Record<string, unknown>>[];
export function getCollection(
	name: string,
): TypedCollectionEntry<Record<string, unknown>>[] {
	const collection = resolveCollection(name);
	return collection.entries.map((e) => toTypedEntry(e));
}

/**
 * Retrieve a single entry or a filtered subset from a content collection.
 *
 * @param name - The collection name (directory path relative to content root).
 * @param filter - Either a slug string (filename without `.md`) to find a
 *   single entry, or a predicate function to filter multiple entries.
 *
 * When `filter` is a string, returns one entry or throws if not found.
 * When `filter` is a function, returns an array of matching entries.
 */
export function getCollectionEntry<K extends keyof CollectionMap>(
	name: K,
	filter: string,
): TypedCollectionEntry<CollectionMap[K]>;
export function getCollectionEntry<K extends keyof CollectionMap>(
	name: K,
	filter: (entry: TypedCollectionEntry<CollectionMap[K]>) => boolean,
): TypedCollectionEntry<CollectionMap[K]>[];
export function getCollectionEntry(
	name: string,
	filter: string,
): TypedCollectionEntry<Record<string, unknown>>;
export function getCollectionEntry(
	name: string,
	filter: (
		entry: TypedCollectionEntry<Record<string, unknown>>,
	) => boolean,
): TypedCollectionEntry<Record<string, unknown>>[];
export function getCollectionEntry(
	name: string,
	filter:
		| string
		| ((entry: TypedCollectionEntry<Record<string, unknown>>) => boolean),
):
	| TypedCollectionEntry<Record<string, unknown>>
	| TypedCollectionEntry<Record<string, unknown>>[] {
	const collection = resolveCollection(name);
	const entries = collection.entries.map((e) =>
		toTypedEntry<Record<string, unknown>>(e),
	);

	if (typeof filter === "string") {
		const slug = filter;
		const entry = entries.find(
			(e) => basename(e.filePath, ".md") === slug,
		);

		if (!entry) {
			throw new Error(
				`[vike-content-collection] Entry "${slug}" not found in collection "${name}".`,
			);
		}

		return entry;
	}

	return entries.filter(filter);
}
