import { describe, expect, it } from "bun:test";
import { renderEntry, extractHeadings } from "../src/runtime/render";
import type { TypedCollectionEntry } from "../src/types/index";

function makeEntry(content: string): TypedCollectionEntry<Record<string, unknown>> {
	return {
		filePath: "/pages/blog/test.md",
		slug: "test",
		frontmatter: {},
		content,
		computed: {},
		lastModified: undefined,
		_isDraft: false,
		index: {},
	};
}

describe("renderEntry", () => {
	it("renders markdown to HTML", async () => {
		const entry = makeEntry("# Hello World\n\nSome paragraph text.");
		const result = await renderEntry(entry);

		expect(result.html).toContain("<h1");
		expect(result.html).toContain("Hello World");
		expect(result.html).toContain("<p>");
		expect(result.html).toContain("Some paragraph text.");
	});

	it("extracts headings during render", async () => {
		const entry = makeEntry("# Title\n## Subtitle\n### Nested\n## Another");
		const result = await renderEntry(entry);

		expect(result.headings).toHaveLength(4);
		expect(result.headings[0]).toEqual({ depth: 1, text: "Title", id: "title" });
		expect(result.headings[1]).toEqual({ depth: 2, text: "Subtitle", id: "subtitle" });
		expect(result.headings[2]).toEqual({ depth: 3, text: "Nested", id: "nested" });
		expect(result.headings[3]).toEqual({ depth: 2, text: "Another", id: "another" });
	});

	it("adds slug IDs to headings in HTML", async () => {
		const entry = makeEntry("# Hello World");
		const result = await renderEntry(entry);

		expect(result.html).toContain('id="hello-world"');
	});

	it("handles empty content", async () => {
		const entry = makeEntry("");
		const result = await renderEntry(entry);

		expect(result.html).toBe("");
		expect(result.headings).toHaveLength(0);
	});

	it("renders inline markdown elements", async () => {
		const entry = makeEntry("**bold** and *italic* and `code`");
		const result = await renderEntry(entry);

		expect(result.html).toContain("<strong>bold</strong>");
		expect(result.html).toContain("<em>italic</em>");
		expect(result.html).toContain("<code>code</code>");
	});

	it("renders lists", async () => {
		const entry = makeEntry("- item 1\n- item 2\n- item 3");
		const result = await renderEntry(entry);

		expect(result.html).toContain("<ul>");
		expect(result.html).toContain("<li>item 1</li>");
	});

	it("deduplicates heading IDs", async () => {
		const entry = makeEntry("## Hello\n## Hello");
		const result = await renderEntry(entry);

		expect(result.headings[0].id).toBe("hello");
		expect(result.headings[1].id).toBe("hello-1");
	});
});

describe("extractHeadings", () => {
	it("extracts headings without full render", async () => {
		const headings = await extractHeadings("# Title\n## Section\n### Sub");

		expect(headings).toHaveLength(3);
		expect(headings[0]).toEqual({ depth: 1, text: "Title", id: "title" });
		expect(headings[1]).toEqual({ depth: 2, text: "Section", id: "section" });
		expect(headings[2]).toEqual({ depth: 3, text: "Sub", id: "sub" });
	});

	it("returns empty array for content without headings", async () => {
		const headings = await extractHeadings("Just some paragraph text.");

		expect(headings).toHaveLength(0);
	});

	it("handles empty content", async () => {
		const headings = await extractHeadings("");

		expect(headings).toHaveLength(0);
	});

	it("handles headings with inline formatting", async () => {
		const headings = await extractHeadings("## **Bold** heading");

		expect(headings).toHaveLength(1);
		expect(headings[0].text).toBe("Bold heading");
	});
});
