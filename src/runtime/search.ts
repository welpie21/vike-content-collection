import type {
	CollectionMap,
	InferComputed,
	InferMetadata,
	RelatedEntriesOptions,
	TypedCollectionEntry,
} from "../types/index.js";
import { getCollection } from "./get-collection.js";

function getOverlapScore(
	current: Record<string, unknown>,
	candidate: Record<string, unknown>,
	fields: string[],
): number {
	let score = 0;

	for (const field of fields) {
		const currentVal = current[field];
		const candidateVal = candidate[field];

		if (currentVal == null || candidateVal == null) continue;

		const currentSet = new Set(
			Array.isArray(currentVal) ? currentVal.map(String) : [String(currentVal)],
		);

		const candidateValues = Array.isArray(candidateVal)
			? candidateVal.map(String)
			: [String(candidateVal)];

		for (const v of candidateValues) {
			if (currentSet.has(v)) score++;
		}
	}

	return score;
}

/**
 * Find entries related to a given entry by scoring shared metadata values.
 *
 * For each candidate entry, counts how many values overlap with the current
 * entry across the specified fields. Array fields (like tags) are compared
 * element-by-element. Returns the top `limit` entries sorted by score.
 */
export function getRelatedEntries<K extends keyof CollectionMap>(
	name: K,
	currentSlug: string,
	options: RelatedEntriesOptions,
): TypedCollectionEntry<
	InferMetadata<CollectionMap[K]>,
	InferComputed<CollectionMap[K]>
>[];
export function getRelatedEntries(
	name: string,
	currentSlug: string,
	options: RelatedEntriesOptions,
): TypedCollectionEntry<Record<string, unknown>>[];
export function getRelatedEntries(
	name: string,
	currentSlug: string,
	options: RelatedEntriesOptions,
): TypedCollectionEntry<Record<string, unknown>>[] {
	const { by, limit = 5 } = options;
	const entries = getCollection(name);
	const current = entries.find((e) => e.slug === currentSlug);

	if (!current) return [];

	const scored = entries
		.filter((e) => e.slug !== currentSlug)
		.map((entry) => ({
			entry,
			score: getOverlapScore(
				current.metadata as Record<string, unknown>,
				entry.metadata as Record<string, unknown>,
				by,
			),
		}))
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score);

	return scored.slice(0, limit).map((s) => s.entry);
}
