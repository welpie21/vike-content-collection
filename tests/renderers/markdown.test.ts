import { describe, expect, it } from "bun:test";
import { createMarkdownRenderer } from "../../src/runtime/renderers/markdown";

describe("createMarkdownRenderer", () => {
	it("renders markdown to HTML", async () => {
		const renderer = createMarkdownRenderer();
		const result = await renderer.render("# Hello World\n\nParagraph.");

		expect(result.html).toContain("<h1");
		expect(result.html).toContain("Hello World");
		expect(result.html).toContain("<p>");
	});

	it("extracts headings", async () => {
		const renderer = createMarkdownRenderer();
		const result = await renderer.render("# Title\n## Section\n### Sub");

		expect(result.headings).toHaveLength(3);
		expect(result.headings[0]).toEqual({
			depth: 1,
			text: "Title",
			id: "title",
		});
		expect(result.headings[1]).toEqual({
			depth: 2,
			text: "Section",
			id: "section",
		});
		expect(result.headings[2]).toEqual({
			depth: 3,
			text: "Sub",
			id: "sub",
		});
	});

	it("adds slug IDs to heading elements", async () => {
		const renderer = createMarkdownRenderer();
		const result = await renderer.render("# Hello World");

		expect(result.html).toContain('id="hello-world"');
	});

	it("handles empty content", async () => {
		const renderer = createMarkdownRenderer();
		const result = await renderer.render("");

		expect(result.html).toBe("");
		expect(result.headings).toHaveLength(0);
	});

	it("accepts per-call remark plugins", async () => {
		let pluginCalled = false;
		const testPlugin = () => () => {
			pluginCalled = true;
		};

		const renderer = createMarkdownRenderer();
		await renderer.render("# Test", { remarkPlugins: [testPlugin] });

		expect(pluginCalled).toBe(true);
	});

	it("applies default plugins on every render", async () => {
		let callCount = 0;
		const countPlugin = () => () => {
			callCount++;
		};

		const renderer = createMarkdownRenderer({
			remarkPlugins: [countPlugin],
		});

		await renderer.render("# One");
		await renderer.render("# Two");

		expect(callCount).toBe(2);
	});

	it("merges default and per-call plugins", async () => {
		const calls: string[] = [];
		const defaultPlugin = () => () => {
			calls.push("default");
		};
		const callPlugin = () => () => {
			calls.push("call");
		};

		const renderer = createMarkdownRenderer({
			remarkPlugins: [defaultPlugin],
		});
		await renderer.render("# Test", { remarkPlugins: [callPlugin] });

		expect(calls).toEqual(["default", "call"]);
	});

	it("deduplicates heading IDs", async () => {
		const renderer = createMarkdownRenderer();
		const result = await renderer.render("## Hello\n## Hello");

		expect(result.headings[0].id).toBe("hello");
		expect(result.headings[1].id).toBe("hello-1");
	});
});
