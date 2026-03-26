import type { MetadataLineMap } from "./markdown.js";

export interface CollectionEntry {
	filePath: string;
	slug: string;
	metadata: Record<string, unknown>;
	content: string;
	computed: Record<string, unknown>;
	lastModified: Date | undefined;
	_isDraft: boolean;
	lineMap: MetadataLineMap;
}

export interface Collection {
	name: string;
	type: "content" | "data";
	configDir: string;
	configPath: string;
	markdownDir: string;
	entries: CollectionEntry[];
	index: Map<string, CollectionEntry>;
}

/**
 * In-memory store for all discovered content collections.
 * Keyed by the directory path where +Content.ts lives.
 */
export class CollectionStore {
	private collections = new Map<string, Collection>();
	private nameIndex = new Map<string, Collection>();

	set(configDir: string, collection: Collection): void {
		const existing = this.collections.get(configDir);
		if (existing) {
			this.nameIndex.delete(existing.name);
		}
		this.collections.set(configDir, collection);
		this.nameIndex.set(collection.name, collection);
	}

	get(configDir: string): Collection | undefined {
		return this.collections.get(configDir);
	}

	getByName(name: string): Collection | undefined {
		return this.nameIndex.get(name);
	}

	getAll(): Collection[] {
		return Array.from(this.collections.values());
	}

	has(configDir: string): boolean {
		return this.collections.has(configDir);
	}

	delete(configDir: string): boolean {
		const collection = this.collections.get(configDir);
		if (collection) {
			this.nameIndex.delete(collection.name);
		}
		return this.collections.delete(configDir);
	}

	clear(): void {
		this.collections.clear();
		this.nameIndex.clear();
	}

	updateEntry(configDir: string, entry: CollectionEntry): void {
		const collection = this.collections.get(configDir);
		if (!collection) return;

		const oldEntry = collection.index.get(entry.slug);
		if (oldEntry) {
			const idx = collection.entries.indexOf(oldEntry);
			if (idx >= 0) {
				collection.entries[idx] = entry;
			}
		} else {
			collection.entries.push(entry);
		}

		collection.index.set(entry.slug, entry);
	}

	removeEntry(configDir: string, slug: string): void {
		const collection = this.collections.get(configDir);
		if (!collection) return;

		const oldEntry = collection.index.get(slug);
		if (oldEntry) {
			const idx = collection.entries.indexOf(oldEntry);
			if (idx >= 0) {
				collection.entries.splice(idx, 1);
			}
			collection.index.delete(slug);
		}
	}

	/** Serializable snapshot of all collections for virtual module output */
	toSerializable(): SerializableCollections {
		const result: SerializableCollections = {};
		for (const [dir, { name, entries, type }] of this.collections) {
			result[dir] = {
				name,
				type,
				entries: entries.map(({ lastModified, lineMap: _lineMap, ...e }) => ({
					...e,
					lastModified: lastModified?.toISOString(),
				})),
			};
		}
		return result;
	}
}

export interface SerializableEntry {
	filePath: string;
	slug: string;
	metadata: Record<string, unknown>;
	content: string;
	computed: Record<string, unknown>;
	lastModified: string | undefined;
	_isDraft: boolean;
}

export type SerializableCollections = Record<
	string,
	{
		name: string;
		type: "content" | "data";
		entries: SerializableEntry[];
	}
>;

const STORE_KEY = Symbol.for("vike-content-collection:store");

export function getGlobalStore(): CollectionStore {
	const g = globalThis as Record<symbol, CollectionStore | undefined>;
	if (!g[STORE_KEY]) {
		g[STORE_KEY] = new CollectionStore();
	}
	return g[STORE_KEY];
}

/**
 * Populate the global store from serialized collection data.
 * Used by the production virtual module to hydrate the store
 * in SSR environments where `buildStart` doesn't run.
 *
 * Skips collections that already have entries (e.g. during prerendering
 * where the build process has already populated the store).
 */
export function hydrateGlobalStore(data: SerializableCollections): void {
	const store = getGlobalStore();

	for (const [configDir, collectionData] of Object.entries(data)) {
		const existing = store.get(configDir);
		if (existing && existing.entries.length > 0) continue;

		const entries: CollectionEntry[] = collectionData.entries.map((e) => ({
			...e,
			lastModified: e.lastModified ? new Date(e.lastModified) : undefined,
			lineMap: {},
		}));

		const index = new Map<string, CollectionEntry>();
		for (const entry of entries) {
			index.set(entry.slug, entry);
		}

		store.set(configDir, {
			name: collectionData.name,
			type: collectionData.type,
			configDir,
			configPath: "",
			markdownDir: "",
			entries,
			index,
		});
	}
}

/** Reset the global store (for testing) */
export function resetGlobalStore(): void {
	(globalThis as Record<symbol, CollectionStore | undefined>)[STORE_KEY] =
		undefined;
}
