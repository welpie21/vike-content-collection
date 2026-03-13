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
	const copy = entries.slice();
	if (copy.length <= 1) return copy;

	const sign = order === "desc" ? -1 : 1;
	const sample = copy[0].metadata[key];

	if (sample instanceof Date) {
		copy.sort(
			(a, b) =>
				sign *
				((a.metadata[key] as unknown as Date).getTime() -
					(b.metadata[key] as unknown as Date).getTime()),
		);
	} else if (typeof sample === "number") {
		copy.sort(
			(a, b) =>
				sign *
				((a.metadata[key] as unknown as number) -
					(b.metadata[key] as unknown as number)),
		);
	} else {
		copy.sort((a, b) => {
			const aStr = String(a.metadata[key] ?? "");
			const bStr = String(b.metadata[key] ?? "");
			return sign * aStr.localeCompare(bStr);
		});
	}

	return copy;
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
		if (value == null) continue;

		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) {
				const k = String(value[i]);
				const group = groups.get(k);
				if (group) group.push(entry);
				else groups.set(k, [entry]);
			}
		} else {
			const k = String(value);
			const group = groups.get(k);
			if (group) group.push(entry);
			else groups.set(k, [entry]);
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
