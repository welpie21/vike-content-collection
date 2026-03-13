import type { TypedCollectionEntry } from "../types/index.js";
import { getCollection } from "./get-collection.js";

export interface PaginationResult<T> {
	items: TypedCollectionEntry<T>[];
	currentPage: number;
	totalPages: number;
	totalItems: number;
	hasNextPage: boolean;
	hasPreviousPage: boolean;
}

/**
 * Sort collection entries by a metadata key.
 * Returns a new array; the original is not mutated.
 */
export function sortCollection<T>(
	entries: TypedCollectionEntry<T>[],
	key: keyof T & string,
	order: "asc" | "desc" = "asc",
): TypedCollectionEntry<T>[] {
	return [...entries].sort((a, b) => {
		const aVal = a.metadata[key];
		const bVal = b.metadata[key];

		if (aVal instanceof Date && bVal instanceof Date) {
			return order === "asc"
				? aVal.getTime() - bVal.getTime()
				: bVal.getTime() - aVal.getTime();
		}

		if (typeof aVal === "number" && typeof bVal === "number") {
			return order === "asc" ? aVal - bVal : bVal - aVal;
		}

		const aStr = String(aVal ?? "");
		const bStr = String(bVal ?? "");
		const cmp = aStr.localeCompare(bStr);
		return order === "asc" ? cmp : -cmp;
	});
}

/**
 * Group collection entries by a metadata key.
 *
 * If the metadata value is an array (e.g. tags), the entry is added to a
 * group for each element. Entries where the key is `undefined` or `null`
 * are skipped.
 */
export function groupBy<T>(
	entries: TypedCollectionEntry<T>[],
	key: keyof T & string,
): Map<string, TypedCollectionEntry<T>[]> {
	const groups = new Map<string, TypedCollectionEntry<T>[]>();

	for (const entry of entries) {
		const value = entry.metadata[key];
		if (value === undefined || value === null) continue;

		const keys: string[] = Array.isArray(value)
			? value.map(String)
			: [String(value)];

		for (const k of keys) {
			const group = groups.get(k);
			if (group) {
				group.push(entry);
			} else {
				groups.set(k, [entry]);
			}
		}
	}

	return groups;
}

/**
 * Paginate an array of collection entries.
 */
export function paginate<T>(
	entries: TypedCollectionEntry<T>[],
	options: { pageSize: number; currentPage: number },
): PaginationResult<T> {
	const { pageSize, currentPage } = options;
	const totalItems = entries.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
	const page = Math.max(1, Math.min(currentPage, totalPages));
	const start = (page - 1) * pageSize;
	const items = entries.slice(start, start + pageSize);

	return {
		items,
		currentPage: page,
		totalPages,
		totalItems,
		hasNextPage: page < totalPages,
		hasPreviousPage: page > 1,
	};
}

/**
 * Merge entries from multiple collections into a single array.
 *
 * Useful for aggregated views like "latest updates" pages.
 * The caller can sort, paginate, or filter the combined result.
 */
export function mergeCollections(
	names: string[],
): TypedCollectionEntry<Record<string, unknown>>[] {
	const result: TypedCollectionEntry<Record<string, unknown>>[] = [];
	for (const name of names) {
		result.push(...getCollection(name));
	}
	return result;
}

/**
 * Extract all unique values for a metadata key across entries.
 *
 * Array-valued fields (like tags) are flattened. Entries where the key
 * is `undefined` or `null` are skipped. Returns a sorted, deduplicated array.
 */
export function uniqueValues<T>(
	entries: TypedCollectionEntry<T>[],
	key: keyof T & string,
): string[] {
	const values = new Set<string>();

	for (const entry of entries) {
		const value = entry.metadata[key];
		if (value === undefined || value === null) continue;

		if (Array.isArray(value)) {
			for (const v of value) {
				values.add(String(v));
			}
		} else {
			values.add(String(value));
		}
	}

	return [...values].sort();
}
