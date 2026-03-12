import { describe, expect, it } from "bun:test";
import { createMdxRenderer } from "../../src/runtime/renderers/mdx";

describe("createMdxRenderer", () => {
	it("renders markdown content in MDX files", async () => {
		const renderer = createMdxRenderer();
		const result = await renderer.render("# Hello\n\nParagraph text.");

		expect(result.html).toContain("<h1");
		expect(result.html).toContain("Hello");
		expect(result.html).toContain("<p>");
		expect(result.html).toContain("Paragraph text.");
	});

	it("extracts headings from MDX content", async () => {
		const renderer = createMdxRenderer();
		const result = await renderer.render("# Title\n## Section");

		expect(result.headings).toHaveLength(2);
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
	});

	it("handles JSX elements in MDX", async () => {
		const renderer = createMdxRenderer();
		const content = "# Title\n\nSome text.\n";
		const result = await renderer.render(content);

		expect(result.html).toContain("<h1");
		expect(result.html).toContain("Title");
		expect(result.headings).toHaveLength(1);
	});

	it("handles empty content", async () => {
		const renderer = createMdxRenderer();
		const result = await renderer.render("");

		expect(result.html).toBe("");
		expect(result.headings).toHaveLength(0);
	});

	it("renders inline markdown elements in MDX", async () => {
		const renderer = createMdxRenderer();
		const result = await renderer.render("**bold** and *italic*");

		expect(result.html).toContain("<strong>bold</strong>");
		expect(result.html).toContain("<em>italic</em>");
	});

	it("accepts per-call remark plugins", async () => {
		let pluginCalled = false;
		const testPlugin = () => () => {
			pluginCalled = true;
		};

		const renderer = createMdxRenderer();
		await renderer.render("# Test", { remarkPlugins: [testPlugin] });

		expect(pluginCalled).toBe(true);
	});

	it("applies default plugins on every render", async () => {
		let callCount = 0;
		const countPlugin = () => () => {
			callCount++;
		};

		const renderer = createMdxRenderer({ remarkPlugins: [countPlugin] });

		await renderer.render("# One");
		await renderer.render("# Two");

		expect(callCount).toBe(2);
	});
});
