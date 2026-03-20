import { describe, expect, it } from "bun:test";
import { vikeContentCollectionPlugin } from "../src/plugin/vite-plugin";

function createPlugin(
	resolvedConfig: Record<string, any> = { root: "/tmp/test-project" },
) {
	const plugin = vikeContentCollectionPlugin() as Record<string, any>;
	plugin.configResolved(resolvedConfig);
	return plugin;
}

describe("client-side noop", () => {
	it("resolves vike-content-collection to noop module on client", () => {
		const plugin = createPlugin();
		const result = plugin.resolveId("vike-content-collection", undefined, {
			ssr: false,
		});
		expect(result).toBe("\0vike-content-collection-noop");
	});

	it("does not intercept vike-content-collection on SSR", () => {
		const plugin = createPlugin();
		const result = plugin.resolveId("vike-content-collection", undefined, {
			ssr: true,
		});
		expect(result).toBeUndefined();
	});

	it("does not intercept other modules on client", () => {
		const plugin = createPlugin();
		const result = plugin.resolveId("some-other-package", undefined, {
			ssr: false,
		});
		expect(result).toBeUndefined();
	});

	it("still resolves virtual:content-collection normally", () => {
		const plugin = createPlugin();
		const result = plugin.resolveId("virtual:content-collection", undefined, {
			ssr: false,
		});
		expect(result).toBe("\0virtual:content-collection");
	});

	it("loads noop module with all expected exports", () => {
		const plugin = createPlugin();
		const code = plugin.load("\0vike-content-collection-noop");

		expect(code).toContain("export const getCollection");
		expect(code).toContain("export const getCollectionEntry");
		expect(code).toContain("export const findCollectionEntries");
		expect(code).toContain("export const paginate");
		expect(code).toContain("export const sortCollection");
		expect(code).toContain("export const reference");
		expect(code).toContain("export const renderEntry");
		expect(code).toContain("export const extractHeadings");
		expect(code).toContain("export const createMarkdownRenderer");
		expect(code).toContain("export const createMdxRenderer");
		expect(code).toContain("export const vikeContentCollectionPlugin");
		expect(code).toContain("export default");
	});

	it("does not load noop code for other module IDs", () => {
		const plugin = createPlugin();
		const result = plugin.load("some-other-id");
		expect(result).toBeUndefined();
	});

	it("noop getCollection returns an empty array", async () => {
		const plugin = createPlugin();
		const code = plugin.load("\0vike-content-collection-noop");
		const mod = evaluateNoopModule(code);

		expect(mod.getCollection()).toEqual([]);
	});

	it("noop getCollectionEntry returns undefined", async () => {
		const plugin = createPlugin();
		const code = plugin.load("\0vike-content-collection-noop");
		const mod = evaluateNoopModule(code);

		expect(mod.getCollectionEntry()).toBeUndefined();
	});

	it("noop findCollectionEntries returns empty array", async () => {
		const plugin = createPlugin();
		const code = plugin.load("\0vike-content-collection-noop");
		const mod = evaluateNoopModule(code);

		expect(mod.findCollectionEntries()).toEqual([]);
	});

	it("noop renderEntry returns empty html and headings", async () => {
		const plugin = createPlugin();
		const code = plugin.load("\0vike-content-collection-noop");
		const mod = evaluateNoopModule(code);

		const result = await mod.renderEntry();
		expect(result).toEqual({ html: "", headings: [] });
	});

	it("noop extractHeadings returns empty array", async () => {
		const plugin = createPlugin();
		const code = plugin.load("\0vike-content-collection-noop");
		const mod = evaluateNoopModule(code);

		const result = await mod.extractHeadings();
		expect(result).toEqual([]);
	});

	it("noop paginate returns empty pagination result", async () => {
		const plugin = createPlugin();
		const code = plugin.load("\0vike-content-collection-noop");
		const mod = evaluateNoopModule(code);

		expect(mod.paginate([], {})).toEqual({
			items: [],
			currentPage: 1,
			totalPages: 1,
			totalItems: 0,
			hasNextPage: false,
			hasPreviousPage: false,
		});
	});

	it("accepts configResolved with resolve.alias entries", () => {
		const plugin = createPlugin({
			root: "/tmp/test-project",
			resolve: {
				alias: [
					{ find: "~", replacement: "/tmp/test-project/src" },
					{
						find: "@components",
						replacement: "/tmp/test-project/src/components",
					},
					{ find: /^\/regex-alias/, replacement: "/should-be-skipped" },
				],
			},
		});
		expect(plugin.resolveId("virtual:content-collection")).toBe(
			"\0virtual:content-collection",
		);
	});

	it("handles configResolved without resolve property", () => {
		const plugin = createPlugin({ root: "/tmp/test-project" });
		expect(plugin.resolveId("virtual:content-collection")).toBe(
			"\0virtual:content-collection",
		);
	});

	it("handles configResolved with empty alias array", () => {
		const plugin = createPlugin({
			root: "/tmp/test-project",
			resolve: { alias: [] },
		});
		expect(plugin.resolveId("virtual:content-collection")).toBe(
			"\0virtual:content-collection",
		);
	});
});

function evaluateNoopModule(code: string): Record<string, any> {
	const exports: Record<string, any> = {};
	const fn = new Function(
		"exports",
		code
			.replace(/export const /g, "exports.")
			.replace(/export default [^;]+;/, ""),
	);
	fn(exports);
	return exports;
}
