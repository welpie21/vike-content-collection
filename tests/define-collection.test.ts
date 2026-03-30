import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { defineCollection } from "../src/runtime/define-collection";

/**
 * Compile-time assertion: the two types must be mutually assignable.
 * Usage: `assertType<Expected, Actual>()` — a TS error here means the
 * inferred type doesn't match expectations.
 */
type IsExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
function assertType<_T extends true>() {}

describe("defineCollection", () => {
	it("returns the config object unchanged", () => {
		const schema = z.object({ title: z.string() });
		const config = defineCollection({ schema });

		expect(config.schema).toBe(schema);
	});

	it("preserves all extended config fields", () => {
		const schema = z.object({ title: z.string() });
		const slugFn = () => "custom";
		const computedFn = () => 42;

		const config = defineCollection({
			type: "data",
			schema,
			slug: slugFn,
			computed: { wordCount: computedFn },
			contentPath: "articles",
		});

		expect(config.type).toBe("data");
		expect(config.slug).toBe(slugFn);
		expect(config.computed.wordCount).toBe(computedFn);
		expect(config.contentPath).toBe("articles");
	});

	it("preserves type: 'both'", () => {
		const schema = z.object({ title: z.string() });
		const config = defineCollection({
			type: "both",
			schema,
		});

		expect(config.type).toBe("both");
	});

	it("works with a minimal config (schema only)", () => {
		const schema = z.object({ title: z.string() });
		const config = defineCollection({ schema });

		expect(config.schema).toBe(schema);
		expect(config.type).toBeUndefined();
		expect(config.slug).toBeUndefined();
		expect(config.contentPath).toBeUndefined();
	});

	it("infers computed field return types correctly", () => {
		const schema = z.object({ title: z.string(), date: z.date() });

		const config = defineCollection({
			schema,
			computed: {
				titleLength: ({ metadata }) => metadata.title.length,
				formatted: ({ metadata }) => `Post: ${metadata.title}`,
				stamp: ({ metadata }) => metadata.date.getTime(),
			},
		});

		type Returns = NonNullable<(typeof config)["_computedReturns"]>;
		assertType<IsExact<Returns["titleLength"], number>>();
		assertType<IsExact<Returns["formatted"], string>>();
		assertType<IsExact<Returns["stamp"], number>>();

		expect(config.computed.titleLength).toBeFunction();
		expect(config.computed.formatted).toBeFunction();
	});

	it("resolves _computedReturns to Record<string, never> when no computed is provided", () => {
		const schema = z.object({ title: z.string() });
		const config = defineCollection({ schema });

		type Returns = NonNullable<(typeof config)["_computedReturns"]>;
		assertType<IsExact<Returns, Record<string, never>>>();
	});
});
