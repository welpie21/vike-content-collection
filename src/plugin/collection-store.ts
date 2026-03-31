import type { MetadataLineMap } from "./markdown.js";

export interface FolderNode {
	name: string;
	fullName: string;
	children: CollectionTreeNode[];
	entry?: CollectionEntry;
}

export interface EntryNode {
	name: string;
	fullName: string;
	entry: CollectionEntry;
}

export type CollectionTreeNode = FolderNode | EntryNode;

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
	type: "content" | "data" | "both";
	configDir: string;
	configPath: string;
	markdownDir: string;
	entries: CollectionEntry[];
	index: Map<string, CollectionEntry>;
	tree: FolderNode;
}

/**
 * Build a hierarchical tree from a flat list of entries using their slug paths.
 *
 * Returns a root `FolderNode` representing the collection itself. An entry
 * with an empty slug (`""`) becomes the root's `entry`. Leaf slugs become
 * `EntryNode`s carrying the entry data. Intermediate path segments (and
 * slugs that also have deeper children) become `FolderNode`s. Every node's
 * `fullName` is always set to its full path in the tree, regardless of
 * whether it carries an `entry`.
 */
export function buildCollectionTree(entries: CollectionEntry[]): FolderNode {
	const root: FolderNode = { name: "", fullName: "", children: [] };
	const folderMap = new Map<string, FolderNode>();
	const entryBySlug = new Map(entries.map((e) => [e.slug, e]));
	const folderPaths = new Set<string>();

	const rootEntry = entryBySlug.get("");

	if (rootEntry) {
		root.entry = rootEntry;
	}

	for (const entry of entries) {
		if (entry.slug === "") continue;

		const segments = entry.slug.split("/");
		let path = "";

		for (let i = 0; i < segments.length - 1; i++) {
			path = path ? `${path}/${segments[i]}` : segments[i];
			folderPaths.add(path);
		}
	}

	for (const entry of entries) {
		if (entry.slug === "") continue;

		const segments = entry.slug.split("/");

		let currentPath = "";
		let currentLevel = root.children;

		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i];
			const isLeaf = i === segments.length - 1;

			currentPath = currentPath ? `${currentPath}/${segment}` : segment;

			if (isLeaf && !folderPaths.has(currentPath)) {
				currentLevel.push({
					name: segment,
					fullName: currentPath,
					entry,
				} satisfies EntryNode);
			} else {
				let folder = folderMap.get(currentPath);

				if (!folder) {
					const folderEntry = entryBySlug.get(currentPath);

					folder = {
						name: segment,
						fullName: currentPath,
						children: [],
						...(folderEntry && { entry: folderEntry }),
					};

					folderMap.set(currentPath, folder);
					currentLevel.push(folder);
				} else if (isLeaf && !folder.entry) {
					folder.entry = entry;
				}

				currentLevel = folder.children;
			}
		}
	}

	return root;
}

/** Deep-clone a value, replacing circular references with `null`. */
function safeClone<T>(value: T): T {
	const seen = new WeakSet();
	return JSON.parse(
		JSON.stringify(value, (_key, val) => {
			if (typeof val === "object" && val !== null) {
				if (seen.has(val)) return null;
				seen.add(val);
			}
			return val;
		}),
	);
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
		collection.tree = buildCollectionTree(collection.entries);
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
		collection.tree = buildCollectionTree(collection.entries);
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
			collection.tree = buildCollectionTree(collection.entries);
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
					metadata: safeClone(e.metadata),
					computed: safeClone(e.computed),
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
		type: "content" | "data" | "both";
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
		if (collectionData.entries.length === 0) continue;

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
			tree: { name: "", fullName: "", children: [] },
		});
	}
}

/** Reset the global store (for testing) */
export function resetGlobalStore(): void {
	(globalThis as Record<symbol, CollectionStore | undefined>)[STORE_KEY] =
		undefined;
}
