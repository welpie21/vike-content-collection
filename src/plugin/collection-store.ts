import type { FrontmatterLineMap } from "./markdown.js";

export interface CollectionEntry {
	/** The unique slug of the entry within the collection */
	slug: string;
	/** Absolute path to the markdown file */
	filePath: string;
	/** Validated frontmatter data */
	frontmatter: Record<string, unknown>;
	/** Raw markdown body (without frontmatter) */
	content: string;
	/** Maps frontmatter key paths to their line numbers for error reporting */
	lineMap: FrontmatterLineMap;
}

export interface Collection {
	/** Derived collection name (relative path from content root) */
	name: string;
	/** Directory where the +Content.ts config lives */
	configDir: string;
	/** Absolute path to the +Content.ts file */
	configPath: string;
	/** Resolved entries for this collection */
	entries: CollectionEntry[];
	/** Index of resolved entries by name */
	index: Record<string, CollectionEntry>;
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

	/** Serializable snapshot of all collections for virtual module output */
	toSerializable(): Record<
		string,
		{
			entries: {
				filePath: string;
				frontmatter: Record<string, unknown>;
				content: string;
			}[];
		}
	> {
		const result: Record<
			string,
			{
				entries: {
					filePath: string;
					frontmatter: Record<string, unknown>;
					content: string;
				}[];
			}
		> = {};
		for (const [dir, collection] of this.collections) {
			result[dir] = {
				entries: collection.entries.map((e) => ({
					filePath: e.filePath,
					frontmatter: e.frontmatter,
					content: e.content,
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
