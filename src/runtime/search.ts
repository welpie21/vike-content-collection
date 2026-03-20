import type {
	CollectionMap,
	InferComputed,
	InferMetadata,
	RelatedEntriesOptions,
	TypedCollectionEntry,
} from "../types/index.js";
import { getCollection, getCollectionEntry } from "./get-collection.js";

function buildFieldSets(
	metadata: Record<string, unknown>,
	fields: string[],
): Map<string, Set<string>> {
	const sets = new Map<string, Set<string>>();
	for (const field of fields) {
		const val = metadata[field];
		if (val == null) continue;
		sets.set(
			field,
			new Set(Array.isArray(val) ? val.map(String) : [String(val)]),
		);
	}
	return sets;
}

function getOverlapScore(
	currentSets: Map<string, Set<string>>,
	candidate: Record<string, unknown>,
	fields: string[],
): number {
	let score = 0;

	for (const field of fields) {
		const currentSet = currentSets.get(field);
		const candidateVal = candidate[field];
		if (!currentSet || candidateVal == null) continue;

		const candidateValues = Array.isArray(candidateVal)
			? candidateVal
			: [candidateVal];

		for (const v of candidateValues) {
			if (currentSet.has(String(v))) score++;
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
	const current = getCollectionEntry(name, currentSlug);

	if (!current) return [];

	const currentSets = buildFieldSets(
		current.metadata as Record<string, unknown>,
		by,
	);
	const entries = getCollection(name);

	const scored = entries
		.filter((e) => e.slug !== currentSlug)
		.map((entry) => ({
			entry,
			score: getOverlapScore(
				currentSets,
				entry.metadata as Record<string, unknown>,
				by,
			),
		}))
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score);

	return scored.slice(0, limit).map((s) => s.entry);
}
