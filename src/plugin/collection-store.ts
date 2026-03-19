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

	set(configDir: string, collection: Collection): void {
		this.collections.set(configDir, collection);
	}

	get(configDir: string): Collection | undefined {
		return this.collections.get(configDir);
	}

	getByName(name: string): Collection | undefined {
		for (const collection of this.collections.values()) {
			if (collection.name === name) return collection;
		}
		return undefined;
	}

	getAll(): Collection[] {
		return Array.from(this.collections.values());
	}

	has(configDir: string): boolean {
		return this.collections.has(configDir);
	}

	delete(configDir: string): boolean {
		return this.collections.delete(configDir);
	}

	clear(): void {
		this.collections.clear();
	}

	updateEntry(configDir: string, entry: CollectionEntry): void {
		const collection = this.collections.get(configDir);
		if (!collection) return;
		const idx = collection.entries.findIndex((e) => e.slug === entry.slug);

		if (idx >= 0) {
			collection.entries[idx] = entry;
		} else {
			collection.entries.push(entry);
		}

		collection.index.set(entry.slug, entry);
	}

	removeEntry(configDir: string, slug: string): void {
		const collection = this.collections.get(configDir);
		if (!collection) return;

		collection.entries = collection.entries.filter((e) => e.slug !== slug);
		collection.index.delete(slug);
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
		for (const [dir, collection] of this.collections) {
			result[dir] = {
				type: collection.type,
				entries: collection.entries.map((e) => ({
					filePath: e.filePath,
					slug: e.slug,
					metadata: e.metadata,
					content: e.content,
					computed: e.computed,
					lastModified: e.lastModified?.toISOString(),
					_isDraft: e._isDraft,
				})),
			};
		}
		return result;
	}
}

let globalStore: CollectionStore | null = null;

export function getGlobalStore(): CollectionStore {
	if (!globalStore) {
		globalStore = new CollectionStore();
	}
	return globalStore;
}

/** Reset the global store (for testing) */
export function resetGlobalStore(): void {
	globalStore = null;
}
