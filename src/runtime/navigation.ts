import { type Collection, getGlobalStore } from "../plugin/collection-store.js";
import type {
	AdjacentEntries,
	Breadcrumb,
	BreadcrumbOptions,
	CollectionMap,
	ContentCollection,
	EntryUrlOptions,
	InferComputed,
	InferMetadata,
} from "../types/index.js";
import { getCollection } from "./get-collection.js";
import { sortCollection } from "./helpers.js";

function titleCase(segment: string): string {
	return segment
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Generate a breadcrumb trail from a collection name and optional entry slug.
 *
 * Collection names encode hierarchy (e.g. `"docs/guides"` produces two
 * path segments). Each segment is resolved to a label via `options.labels`
 * or title-cased from the segment name.
 */
export function getBreadcrumbs(
	collectionName: string,
	slug?: string,
	options: BreadcrumbOptions = {},
): Breadcrumb[] {
	const {
		labels = {},
		basePath = "/",
		includeCurrent = true,
		currentLabel,
	} = options;

	const normalizedBase = basePath.replace(/\/+$/, "");
	const segments = collectionName.split("/").filter(Boolean);
	const crumbs: Breadcrumb[] = [];
	let cumulativePath = normalizedBase;

	for (const segment of segments) {
		cumulativePath = `${cumulativePath}/${segment}`;
		crumbs.push({
			label: labels[segment] ?? titleCase(segment),
			path: cumulativePath,
		});
	}

	if (slug && includeCurrent) {
		const entryPath = `${cumulativePath}/${slug}`;
		crumbs.push({
			label: currentLabel ?? titleCase(slug),
			path: entryPath,
		});
	}

	return crumbs;
}

/**
 * Get the previous and next entries relative to a given slug in a collection.
 *
 * Optionally sort entries by a metadata key before determining adjacency.
 */
export function getAdjacentEntries<K extends keyof CollectionMap>(
	name: K,
	currentSlug: string,
	options?: { sortBy?: string; order?: "asc" | "desc" },
): AdjacentEntries<
	InferMetadata<CollectionMap[K]>,
	InferComputed<CollectionMap[K]>
>;
export function getAdjacentEntries(
	name: string,
	currentSlug: string,
	options?: { sortBy?: string; order?: "asc" | "desc" },
): AdjacentEntries<Record<string, unknown>>;
export function getAdjacentEntries(
	name: string,
	currentSlug: string,
	options: { sortBy?: string; order?: "asc" | "desc" } = {},
): AdjacentEntries<Record<string, unknown>> {
	let entries = getCollection(name);

	if (options.sortBy) {
		entries = sortCollection(entries, options.sortBy, options.order);
	}

	const idx = entries.findIndex((e) => e.slug === currentSlug);

	if (idx === -1) {
		return { prev: undefined, next: undefined };
	}

	return {
		prev: idx > 0 ? entries[idx - 1] : undefined,
		next: idx < entries.length - 1 ? entries[idx + 1] : undefined,
	};
}

/**
 * Returns a list of all registered content collections.
 */
export function getContentCollections(): ContentCollection[] {
	return getGlobalStore().getAll().map(toContentCollection);
}

/**
 * Returns a content collection by its path.
 */
export function getContentCollection(
	path: string,
): ContentCollection | undefined {
	const store = getGlobalStore();
	const collection = store.getByName(path);

	if (!collection) return undefined;

	return toContentCollection(collection);
}

function toContentCollection(collection: Collection): ContentCollection {
	return {
		name: collection.name.split("/").pop() ?? collection.name,
		path: collection.name,
		type: collection.type,
	};
}

/**
 * Generate a URL path for a collection entry.
 *
 * Builds the path from the base path, collection name segments, slug,
 * and an optional file extension.
 */
export function getEntryUrl(
	collectionName: string,
	slug: string,
	options: EntryUrlOptions = {},
): string {
	const { basePath = "/", extension = "" } = options;
	const normalizedBase = basePath.replace(/\/+$/, "");
	const segments = collectionName.split("/").filter(Boolean);
	const path = [normalizedBase, ...segments, slug].join("/");
	return `${path}${extension}`;
}
