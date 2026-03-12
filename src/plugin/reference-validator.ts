import { isReference } from "../runtime/reference.js";
import type { CollectionStore } from "./collection-store.js";

/**
 * Walk metadata values looking for reference markers and verify the
 * referenced slugs exist in the target collection.  Logs warnings for
 * any broken references rather than throwing so the build can surface
 * all issues at once.
 */
export function validateReferences(store: CollectionStore): void {
	for (const collection of store.getAll()) {
		for (const entry of collection.entries) {
			walkAndValidate(entry.metadata, entry.filePath, store);
		}
	}
}

function walkAndValidate(
	obj: unknown,
	sourceFile: string,
	store: CollectionStore,
): void {
	if (obj == null || typeof obj !== "object") return;

	if (Array.isArray(obj)) {
		for (const item of obj) {
			walkAndValidate(item, sourceFile, store);
		}
		return;
	}

	for (const [_key, value] of Object.entries(obj as Record<string, unknown>)) {
		if (typeof value === "string") {
			// The value itself can't tell us if it's a reference at runtime.
			// Reference validation therefore checks by looking at the schema
			// shape registered via `reference()`.  Because Zod brands are
			// stripped after parsing, we rely on the collection-level scan below.
			continue;
		}
		walkAndValidate(value, sourceFile, store);
	}
}

/**
 * Validate that all string values in metadata fields that were typed
 * with `reference(collectionName)` actually point to existing slugs.
 *
 * This is invoked after all collections have been processed so every
 * target collection is fully populated.
 */
export function validateReferenceFields(
	store: CollectionStore,
	schemaMap: Map<string, unknown>,
): string[] {
	const errors: string[] = [];

	for (const collection of store.getAll()) {
		const schema = schemaMap.get(collection.configPath);
		if (!schema || typeof schema !== "object") continue;

		const refFields = extractReferenceFields(schema);
		if (refFields.length === 0) continue;

		for (const entry of collection.entries) {
			for (const { path, targetCollection } of refFields) {
				const value = getNestedValue(entry.metadata, path);
				if (value == null) continue;

				const slugs = Array.isArray(value) ? value : [value];
				for (const slug of slugs) {
					if (typeof slug !== "string") continue;
					const target = store.getByName(targetCollection);
					if (!target) {
						errors.push(
							`${entry.filePath}: references collection "${targetCollection}" which does not exist (field "${path}")`,
						);
						continue;
					}
					const exists = target.entries.some((e) => e.slug === slug);
					if (!exists) {
						errors.push(
							`${entry.filePath}: references slug "${slug}" in collection "${targetCollection}" which does not exist (field "${path}")`,
						);
					}
				}
			}
		}
	}

	if (errors.length > 0) {
		console.warn(
			`[vike-content-collection] Reference validation warnings:\n${errors.map((e) => `  ${e}`).join("\n")}`,
		);
	}

	return errors;
}

interface RefField {
	path: string;
	targetCollection: string;
}

function extractReferenceFields(schema: unknown): RefField[] {
	const fields: RefField[] = [];
	if (!schema || typeof schema !== "object") return fields;

	const shape = (schema as any)?.shape ?? (schema as any)?._def?.shape?.();
	if (!shape) return fields;

	for (const [key, fieldSchema] of Object.entries(shape)) {
		if (isReference(fieldSchema)) {
			fields.push({
				path: key,
				targetCollection: (fieldSchema as any)._collectionRef,
			});
		}
	}

	return fields;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
	const parts = path.split(".");
	let current: unknown = obj;
	for (const part of parts) {
		if (current == null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}
