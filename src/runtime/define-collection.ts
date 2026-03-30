import type { ZodSchema } from "zod";
import type { ComputedFieldInput, SlugInput } from "../types/index.js";

type InferZod<S> = S extends ZodSchema<infer T> ? T : Record<string, unknown>;

/**
 * Define a content collection with full type inference.
 *
 * Wrapping your `+Content.ts` export with `defineCollection()` gives you
 * typed `metadata` inside the `slug` and `computed` callbacks, based on
 * the Zod schema you provide. Computed field return types are preserved
 * via `_computedReturns` so that generated type helpers can extract
 * specific return types per field.
 */
export function defineCollection<
	S extends ZodSchema,
	R extends Record<string, unknown>,
>(config: {
	type?: "content" | "data" | "both";
	schema: S;
	computed: {
		[K in keyof R]: (input: ComputedFieldInput<InferZod<S>>) => R[K];
	};
	slug?: (input: SlugInput<InferZod<S>>) => string;
	contentPath?: string;
}): {
	type?: "content" | "data" | "both";
	schema: S;
	computed: {
		[K in keyof R]: (input: ComputedFieldInput<InferZod<S>>) => R[K];
	};
	/** @internal Type-level only — holds computed return types for generated type extraction. */
	_computedReturns?: R;
	slug?: (input: SlugInput<InferZod<S>>) => string;
	contentPath?: string;
};
export function defineCollection<S extends ZodSchema>(config: {
	type?: "content" | "data" | "both";
	schema: S;
	slug?: (input: SlugInput<InferZod<S>>) => string;
	contentPath?: string;
}): {
	type?: "content" | "data" | "both";
	schema: S;
	/** @internal Type-level only — holds computed return types for generated type extraction. */
	_computedReturns?: Record<string, never>;
	slug?: (input: SlugInput<InferZod<S>>) => string;
	contentPath?: string;
};
export function defineCollection(
	config: Record<string, unknown>,
): Record<string, unknown> {
	return config;
}
