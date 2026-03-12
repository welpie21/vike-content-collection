import type { CollectionEntry } from "../plugin/collection-store.js";
import { getGlobalStore } from "../plugin/collection-store.js";
import type {
	CollectionEntryFilter,
	CollectionEntryFilterInput,
	CollectionMap,
	TypedCollectionEntry,
} from "../types/index.js";

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

function buildTypedIndex<T>(
	index: Record<string, CollectionEntry>,
): Record<string, TypedCollectionEntry<T>> {
	const typedIndex: Record<string, TypedCollectionEntry<T>> = {};
	for (const [slug, entry] of Object.entries(index)) {
		typedIndex[slug] = {
			filePath: entry.filePath,
			slug: entry.slug,
			metadata: entry.metadata as T,
			content: entry.content,
			computed: entry.computed,
			lastModified: entry.lastModified,
			_isDraft: entry._isDraft,
			index: typedIndex,
		};
	}
	return typedIndex;
}

function toTypedEntries<T>(
	entries: CollectionEntry[],
): TypedCollectionEntry<T>[] {
	if (entries.length === 0) return [];
	const typedIndex = buildTypedIndex<T>(entries[0].index);
	return entries.map((e) => typedIndex[e.slug]);
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
	return toTypedEntries(collection.entries);
}

function matchesFilter<T>(
	entry: TypedCollectionEntry<T>,
	filter: CollectionEntryFilter<T>,
): boolean {
	if (typeof filter === "string") {
		return entry.slug === filter;
	}
	if (filter instanceof RegExp) {
		return filter.test(entry.slug);
	}
	return filter(entry);
}

/**
 * Retrieve entries from a content collection.
 *
 * @param name - The collection name (directory path relative to content root).
 * @param filter - One of:
 *   - A `string` slug to look up a single entry (returns the entry or `undefined`).
 *   - A `RegExp` to match slugs (returns an array of matching entries).
 *   - A predicate function to filter entries (returns an array of matching entries).
 *   - An array of the above (OR semantics, returns an array of matching entries).
 */
export function getCollectionEntry<K extends keyof CollectionMap>(
	name: K,
	filter: string,
): TypedCollectionEntry<CollectionMap[K]> | undefined;
export function getCollectionEntry<K extends keyof CollectionMap>(
	name: K,
	filter: RegExp,
): TypedCollectionEntry<CollectionMap[K]>[];
export function getCollectionEntry<K extends keyof CollectionMap>(
	name: K,
	filter: CollectionEntryFilter<CollectionMap[K]>[],
): TypedCollectionEntry<CollectionMap[K]>[];
export function getCollectionEntry<K extends keyof CollectionMap>(
	name: K,
	filter: Exclude<CollectionEntryFilterInput<CollectionMap[K]>, string>,
): TypedCollectionEntry<CollectionMap[K]>[];
export function getCollectionEntry(
	name: string,
	filter: string,
): TypedCollectionEntry<Record<string, unknown>> | undefined;
export function getCollectionEntry(
	name: string,
	filter: RegExp,
): TypedCollectionEntry<Record<string, unknown>>[];
export function getCollectionEntry(
	name: string,
	filter: CollectionEntryFilter<Record<string, unknown>>[],
): TypedCollectionEntry<Record<string, unknown>>[];
export function getCollectionEntry(
	name: string,
	filter: Exclude<CollectionEntryFilterInput<Record<string, unknown>>, string>,
): TypedCollectionEntry<Record<string, unknown>>[];
export function getCollectionEntry(
	name: string,
	filter: CollectionEntryFilterInput<Record<string, unknown>>,
):
	| TypedCollectionEntry<Record<string, unknown>>
	| TypedCollectionEntry<Record<string, unknown>>[]
	| undefined {
	const collection = resolveCollection(name);
	const entries = toTypedEntries<Record<string, unknown>>(collection.entries);

	if (typeof filter === "string") {
		return entries.find((e) => e.slug === filter);
	}

	if (Array.isArray(filter)) {
		const filters = filter;
		return entries.filter((e) => filters.some((f) => matchesFilter(e, f)));
	}

	if (filter instanceof RegExp) {
		return entries.filter((e) => filter.test(e.slug));
	}

	return entries.filter(filter);
}
