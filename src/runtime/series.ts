import type {
	CollectionMap,
	InferComputed,
	InferMetadata,
	SeriesOptions,
	SeriesResult,
} from "../types/index.js";
import { getCollection } from "./get-collection.js";
import { sortCollection } from "./helpers.js";

/**
 * Get an ordered series of entries sharing a common series identifier.
 *
 * Entries declare series membership via metadata fields (e.g.
 * `series: "react-tutorial"` and `seriesOrder: 2`). Returns the full
 * ordered series with positional context for the current entry.
 *
 * Returns `undefined` if no entries match the series or the slug
 * is not found within it.
 */
export function getSeries<K extends keyof CollectionMap>(
	name: K,
	currentSlug: string,
	seriesName: string,
	options?: SeriesOptions,
):
	| SeriesResult<
			InferMetadata<CollectionMap[K]>,
			InferComputed<CollectionMap[K]>
	  >
	| undefined;
export function getSeries(
	name: string,
	currentSlug: string,
	seriesName: string,
	options?: SeriesOptions,
): SeriesResult<Record<string, unknown>> | undefined;
export function getSeries(
	name: string,
	currentSlug: string,
	seriesName: string,
	options: SeriesOptions = {},
): SeriesResult<Record<string, unknown>> | undefined {
	const { seriesField = "series", orderField = "seriesOrder" } = options;

	const allEntries = getCollection(name);
	const seriesEntries = allEntries.filter(
		(e) => (e.metadata as Record<string, unknown>)[seriesField] === seriesName,
	);

	if (seriesEntries.length === 0) return undefined;

	const sorted = sortCollection(seriesEntries, orderField, "asc");
	const idx = sorted.findIndex((e) => e.slug === currentSlug);

	if (idx === -1) return undefined;

	return {
		name: seriesName,
		entries: sorted,
		currentIndex: idx,
		total: sorted.length,
		prev: idx > 0 ? sorted[idx - 1] : undefined,
		next: idx < sorted.length - 1 ? sorted[idx + 1] : undefined,
	};
}
