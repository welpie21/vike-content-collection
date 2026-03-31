import type {
	CollectionEntry,
	CollectionTreeNode,
	FolderNode,
} from "../plugin/collection-store.js";
import { getGlobalStore } from "../plugin/collection-store.js";
import type {
	CollectionEntryFilter,
	CollectionEntryFilterInput,
	CollectionMap,
	InferComputed,
	InferMetadata,
	TypedCollectionEntry,
	TypedFolderNode,
	TypedTreeNode,
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

function toTypedTreeNode<TM, TC>(
	node: CollectionTreeNode,
): TypedTreeNode<TM, TC> {
	if ("children" in node) {
		return toTypedFolderNode<TM, TC>(node);
	}

	return {
		name: node.name,
		fullName: node.fullName,
		entry: toTypedEntry<TM, TC>(node.entry),
	};
}

function toTypedFolderNode<TM, TC>(node: FolderNode): TypedFolderNode<TM, TC> {
	return {
		name: node.name,
		fullName: node.fullName,
		children: node.children.map((c) => toTypedTreeNode<TM, TC>(c)),
		...(node.entry && { entry: toTypedEntry<TM, TC>(node.entry) }),
	};
}

/**
 * Retrieve the entry hierarchy of a content collection as a tree.
 *
 * Returns a root `FolderNode` representing the collection. Entries whose
 * slugs contain `/` are grouped into nested child nodes. An entry with
 * an empty slug (`""`) becomes the root node's `entry`. Every node's
 * `fullName` is always its full path in the tree.
 *
 * The tree is cached in the collection store and rebuilt automatically
 * when entries change.
 */
export function getCollectionTree<K extends keyof CollectionMap>(
	name: K,
): TypedFolderNode<
	InferMetadata<CollectionMap[K]>,
	InferComputed<CollectionMap[K]>
>;
export function getCollectionTree(
	name: string,
): TypedFolderNode<Record<string, unknown>>;
export function getCollectionTree(
	name: string,
): TypedFolderNode<Record<string, unknown>> {
	return toTypedFolderNode(resolveCollection(name).tree);
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
