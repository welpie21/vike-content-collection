import { z } from "zod";

const REFERENCE_METADATA = Symbol.for("vike-content-collection:reference");

/**
 * Create a Zod schema that validates a slug string and marks it as
 * a reference to another collection. After all collections are loaded,
 * the plugin verifies that the referenced slug actually exists.
 */
export function reference(collectionName: string) {
	const schema = z.string().brand(REFERENCE_METADATA);
	(schema as any)._collectionRef = collectionName;
	return schema;
}

/** Check whether a Zod schema was created by `reference()`. */
export function isReference(schema: unknown): schema is z.ZodBranded<
	z.ZodString,
	typeof REFERENCE_METADATA
> & {
	_collectionRef: string;
} {
	return (
		!!schema &&
		typeof schema === "object" &&
		"_collectionRef" in schema &&
		"safeParse" in schema &&
		typeof (schema as any).safeParse === "function"
	);
}

/** Extract the target collection name from a reference schema. */
export function getReferenceTarget(schema: unknown): string | null {
	if (isReference(schema)) return schema._collectionRef;
	return null;
}
