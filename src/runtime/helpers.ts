import type { TypedCollectionEntry } from "../types/index.js";

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
