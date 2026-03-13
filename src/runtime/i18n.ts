import type {
	CollectionMap,
	InferComputed,
	InferMetadata,
	LocaleOptions,
	TypedCollectionEntry,
} from "../types/index.js";
import { getCollection } from "./get-collection.js";

/**
 * Get all available locales for a given base slug within a collection.
 *
 * Supports two strategies:
 * - **suffix** (default): detects locales from slug suffixes
 *   (e.g. `getting-started.fr` has locale `"fr"`)
 * - **metadata**: reads locales from a metadata field
 */
export function getAvailableLocales<K extends keyof CollectionMap>(
	name: K,
	baseSlug: string,
	options?: LocaleOptions,
): string[];
export function getAvailableLocales(
	name: string,
	baseSlug: string,
	options?: LocaleOptions,
): string[];
export function getAvailableLocales(
	name: string,
	baseSlug: string,
	options: LocaleOptions = {},
): string[] {
	const { strategy = "suffix", field = "locale", separator = "." } = options;
	const entries = getCollection(name);
	const locales: Set<string> = new Set();

	if (strategy === "suffix") {
		const prefix = `${baseSlug}${separator}`;
		for (const entry of entries) {
			if (entry.slug === baseSlug) {
				locales.add("");
			} else if (entry.slug.startsWith(prefix)) {
				locales.add(entry.slug.slice(prefix.length));
			}
		}
	} else {
		for (const entry of entries) {
			const meta = entry.metadata as Record<string, unknown>;
			const entryLocale = meta[field];
			if (entryLocale == null) continue;

			const entryBase = entry.slug.startsWith(`${baseSlug}${separator}`)
				? baseSlug
				: entry.slug === baseSlug
					? baseSlug
					: null;

			if (entryBase === baseSlug) {
				locales.add(String(entryLocale));
			}
		}
	}

	return [...locales].sort();
}

/**
 * Get a specific localized version of an entry.
 *
 * Supports two strategies:
 * - **suffix** (default): looks up `baseSlug.locale`
 *   (or `baseSlug` if locale is empty)
 * - **metadata**: finds entry matching base slug with `metadata[field] === locale`
 */
export function getLocalizedEntry<K extends keyof CollectionMap>(
	name: K,
	baseSlug: string,
	locale: string,
	options?: LocaleOptions,
):
	| TypedCollectionEntry<
			InferMetadata<CollectionMap[K]>,
			InferComputed<CollectionMap[K]>
	  >
	| undefined;
export function getLocalizedEntry(
	name: string,
	baseSlug: string,
	locale: string,
	options?: LocaleOptions,
): TypedCollectionEntry<Record<string, unknown>> | undefined;
export function getLocalizedEntry(
	name: string,
	baseSlug: string,
	locale: string,
	options: LocaleOptions = {},
): TypedCollectionEntry<Record<string, unknown>> | undefined {
	const { strategy = "suffix", field = "locale", separator = "." } = options;
	const entries = getCollection(name);

	if (strategy === "suffix") {
		const targetSlug =
			locale === "" ? baseSlug : `${baseSlug}${separator}${locale}`;
		return entries.find((e) => e.slug === targetSlug);
	}

	return entries.find((e) => {
		const meta = e.metadata as Record<string, unknown>;
		const slugMatches =
			e.slug === baseSlug || e.slug.startsWith(`${baseSlug}${separator}`);
		return slugMatches && String(meta[field]) === locale;
	});
}
