import type { CollectionEntry } from "../plugin/collection-store.js";
import { getGlobalStore } from "../plugin/collection-store.js";
import type {
	CollectionEntryFilter,
	CollectionEntryFilterInput,
	CollectionMap,
	InferComputed,
	InferMetadata,
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

function toTypedEntry<
	TM = Record<string, unknown>,
	TC = Record<string, unknown>,
>(entry: CollectionEntry): TypedCollectionEntry<TM, TC> {
	return {
		filePath: entry.filePath,
		slug: entry.slug,
		metadata: entry.metadata as TM,
		content: entry.content,
		computed: entry.computed as TC,
		lastModified: entry.lastModified,
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
): TypedCollectionEntry<
	InferMetadata<CollectionMap[K]>,
	InferComputed<CollectionMap[K]>
>[];
export function getCollection(
	name: string,
): TypedCollectionEntry<Record<string, unknown>>[];
export function getCollection(
	name: string,
): TypedCollectionEntry<Record<string, unknown>>[] {
	return resolveCollection(name).entries.map((e) => toTypedEntry(e));
}

function matchesFilter<TM, TC>(
	entry: TypedCollectionEntry<TM, TC>,
	filter: CollectionEntryFilter<TM, TC>,
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
 * Look up a single entry by slug in a content collection.
 *
 * @param name - The collection name (directory path relative to content root).
 * @param slug - The exact slug to look up.
 * @returns The matching entry, or `undefined` if no entry has that slug.
 */
export function getCollectionEntry<K extends keyof CollectionMap>(
	name: K,
	slug: string,
):
	| TypedCollectionEntry<
			InferMetadata<CollectionMap[K]>,
			InferComputed<CollectionMap[K]>
	  >
	| undefined;
export function getCollectionEntry(
	name: string,
	slug: string,
): TypedCollectionEntry<Record<string, unknown>> | undefined;
export function getCollectionEntry(
	name: string,
	slug: string,
): TypedCollectionEntry<Record<string, unknown>> | undefined {
	const entry = resolveCollection(name).index.get(slug);

	if (entry) {
		return toTypedEntry(entry);
	}

	return undefined;
}

/**
 * Find entries in a content collection that match a filter.
 *
 * @param name - The collection name (directory path relative to content root).
 * @param filter - One of:
 *   - A `RegExp` to match slugs.
 *   - A predicate function to filter entries.
 *   - An array of filters (string, RegExp, or predicate) with OR semantics.
 * @returns An array of matching entries.
 */
export function findCollectionEntries<K extends keyof CollectionMap>(
	name: K,
	filter: Exclude<
		CollectionEntryFilterInput<
			InferMetadata<CollectionMap[K]>,
			InferComputed<CollectionMap[K]>
		>,
		string
	>,
): TypedCollectionEntry<
	InferMetadata<CollectionMap[K]>,
	InferComputed<CollectionMap[K]>
>[];
export function findCollectionEntries(
	name: string,
	filter: Exclude<CollectionEntryFilterInput<Record<string, unknown>>, string>,
): TypedCollectionEntry<Record<string, unknown>>[];
export function findCollectionEntries(
	name: string,
	filter: Exclude<CollectionEntryFilterInput<Record<string, unknown>>, string>,
): TypedCollectionEntry<Record<string, unknown>>[] {
	const collection = resolveCollection(name);

	if (Array.isArray(filter)) {
		const stringFilters: string[] = [];
		const otherFilters: CollectionEntryFilter<
			Record<string, unknown>,
			Record<string, unknown>
		>[] = [];

		for (const f of filter) {
			if (typeof f === "string") {
				stringFilters.push(f);
			} else {
				otherFilters.push(f);
			}
		}

		const result: TypedCollectionEntry<Record<string, unknown>>[] = [];
		const seen = new Set<string>();

		for (const slug of stringFilters) {
			if (seen.has(slug)) continue;
			const entry = collection.index.get(slug);
			if (entry) {
				result.push(toTypedEntry(entry));
				seen.add(slug);
			}
		}

		if (otherFilters.length > 0) {
			for (const raw of collection.entries) {
				if (seen.has(raw.slug)) continue;
				const typed = toTypedEntry(raw);
				if (otherFilters.some((f) => matchesFilter(typed, f))) {
					result.push(typed);
					seen.add(raw.slug);
				}
			}
		}

		return result;
	}

	if (filter instanceof RegExp) {
		return collection.entries
			.filter((e) => filter.test(e.slug))
			.map(toTypedEntry);
	}

	const result: TypedCollectionEntry<Record<string, unknown>>[] = [];
	for (const raw of collection.entries) {
		const typed = toTypedEntry(raw);
		if (filter(typed)) {
			result.push(typed);
		}
	}
	return result;
}
