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
	toSerializable(): Record<
		string,
		{
			type: "content" | "data";
			entries: {
				filePath: string;
				slug: string;
				metadata: Record<string, unknown>;
				content: string;
				computed: Record<string, unknown>;
				lastModified: string | undefined;
				_isDraft: boolean;
			}[];
		}
	> {
		const result: Record<
			string,
			{
				type: "content" | "data";
				entries: {
					filePath: string;
					slug: string;
					metadata: Record<string, unknown>;
					content: string;
					computed: Record<string, unknown>;
					lastModified: string | undefined;
					_isDraft: boolean;
				}[];
			}
		> = {};
		for (const [dir, { entries, type }] of this.collections) {
			result[dir] = {
				entries: entries.map(({ lastModified, ...e }) => ({
					...e,
					lastModified: lastModified?.toISOString(),
				})),
				type,
			};
		}
		return result;
	}
}

const STORE_KEY = Symbol.for("vike-content-collection:store");

export function getGlobalStore(): CollectionStore {
	const g = globalThis as Record<symbol, CollectionStore | undefined>;
	if (!g[STORE_KEY]) {
		g[STORE_KEY] = new CollectionStore();
	}
	return g[STORE_KEY];
}

/** Reset the global store (for testing) */
export function resetGlobalStore(): void {
	(globalThis as Record<symbol, CollectionStore | undefined>)[STORE_KEY] =
		undefined;
}
