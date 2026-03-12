import type { FrontmatterLineMap } from "./markdown.js";

export interface CollectionEntry {
	/** Absolute path to the source file */
	filePath: string;
	/** Unique slug of the entry within the collection */
	slug: string;
	/** Validated frontmatter data */
	frontmatter: Record<string, unknown>;
	/** Raw markdown body (without frontmatter). Empty string for data entries. */
	content: string;
	/** Values produced by computed field functions */
	computed: Record<string, unknown>;
	/** Git-based last modification date, if enabled */
	lastModified: Date | undefined;
	/** Whether the entry is a draft */
	_isDraft: boolean;
	/** Maps frontmatter key paths to their line numbers for error reporting */
	lineMap: FrontmatterLineMap;
	/** Index of resolved entries by slug */
	index: Record<string, CollectionEntry>;
}

export interface Collection {
	/** Derived collection name (relative path from content root) */
	name: string;
	/** Whether this is a 'content' or 'data' collection */
	type: "content" | "data";
	/** Directory where the +Content.ts config lives */
	configDir: string;
	/** Absolute path to the +Content.ts file */
	configPath: string;
	/** Directory where content/data files are searched */
	markdownDir: string;
	/** Resolved entries for this collection */
	entries: CollectionEntry[];
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
		entry.index = Object.fromEntries(
			collection.entries.map((e) => [e.slug, e]),
		);
		for (const e of collection.entries) {
			e.index = entry.index;
		}
	}

	removeEntry(configDir: string, slug: string): void {
		const collection = this.collections.get(configDir);
		if (!collection) return;
		collection.entries = collection.entries.filter((e) => e.slug !== slug);
		const newIndex = Object.fromEntries(
			collection.entries.map((e) => [e.slug, e]),
		);
		for (const e of collection.entries) {
			e.index = newIndex;
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
				frontmatter: Record<string, unknown>;
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
					frontmatter: Record<string, unknown>;
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
					frontmatter: e.frontmatter,
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
