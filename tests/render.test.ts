import { describe, expect, it } from "bun:test";
import {
	buildTocTree,
	extractHeadings,
	renderEntry,
} from "../src/runtime/render";
import type {
	ContentRenderer,
	Heading,
	TypedCollectionEntry,
} from "../src/types/index";

function makeEntry(
	content: string,
): TypedCollectionEntry<Record<string, unknown>> {
	return {
		filePath: "/pages/blog/test.md",
		slug: "test",
		metadata: {},
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
		expect(result.headings[0]).toEqual({
			depth: 1,
			text: "Title",
			id: "title",
		});
		expect(result.headings[1]).toEqual({
			depth: 2,
			text: "Subtitle",
			id: "subtitle",
		});
		expect(result.headings[2]).toEqual({
			depth: 3,
			text: "Nested",
			id: "nested",
		});
		expect(result.headings[3]).toEqual({
			depth: 2,
			text: "Another",
			id: "another",
		});
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

	it("uses a custom renderer when provided", async () => {
		const customRenderer: ContentRenderer = {
			async render(content) {
				return {
					html: `<custom>${content}</custom>`,
					headings: [{ depth: 1, text: "Custom", id: "custom" }],
				};
			},
		};

		const entry = makeEntry("some content");
		const result = await renderEntry(entry, { renderer: customRenderer });

		expect(result.html).toBe("<custom>some content</custom>");
		expect(result.headings).toEqual([
			{ depth: 1, text: "Custom", id: "custom" },
		]);
	});

	it("falls back to default markdown renderer when no renderer specified", async () => {
		const entry = makeEntry("# Default");
		const result = await renderEntry(entry);

		expect(result.html).toContain("<h1");
		expect(result.html).toContain("Default");
	});

	it("passes remark/rehype plugins to custom renderer", async () => {
		let receivedPlugins: any = {};
		const customRenderer: ContentRenderer = {
			async render(_content, options) {
				receivedPlugins = options;
				return { html: "", headings: [] };
			},
		};

		const remarkPlugin = () => () => {};
		const rehypePlugin = () => () => {};

		const entry = makeEntry("test");
		await renderEntry(entry, {
			renderer: customRenderer,
			remarkPlugins: [remarkPlugin],
			rehypePlugins: [rehypePlugin],
		});

		expect(receivedPlugins.remarkPlugins).toEqual([remarkPlugin]);
		expect(receivedPlugins.rehypePlugins).toEqual([rehypePlugin]);
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

describe("buildTocTree", () => {
	it("returns empty array for empty headings", () => {
		const tree = buildTocTree([]);
		expect(tree).toEqual([]);
	});

	it("returns flat nodes for same-depth headings", () => {
		const headings: Heading[] = [
			{ depth: 2, text: "A", id: "a" },
			{ depth: 2, text: "B", id: "b" },
			{ depth: 2, text: "C", id: "c" },
		];

		const tree = buildTocTree(headings);

		expect(tree).toHaveLength(3);
		expect(tree[0].text).toBe("A");
		expect(tree[0].children).toEqual([]);
		expect(tree[1].text).toBe("B");
		expect(tree[2].text).toBe("C");
	});

	it("nests deeper headings as children", () => {
		const headings: Heading[] = [
			{ depth: 2, text: "Parent", id: "parent" },
			{ depth: 3, text: "Child", id: "child" },
		];

		const tree = buildTocTree(headings);

		expect(tree).toHaveLength(1);
		expect(tree[0].text).toBe("Parent");
		expect(tree[0].children).toHaveLength(1);
		expect(tree[0].children[0].text).toBe("Child");
	});

	it("builds a multi-level tree", () => {
		const headings: Heading[] = [
			{ depth: 1, text: "H1", id: "h1" },
			{ depth: 2, text: "H2a", id: "h2a" },
			{ depth: 3, text: "H3", id: "h3" },
			{ depth: 2, text: "H2b", id: "h2b" },
		];

		const tree = buildTocTree(headings);

		expect(tree).toHaveLength(1);
		expect(tree[0].text).toBe("H1");
		expect(tree[0].children).toHaveLength(2);
		expect(tree[0].children[0].text).toBe("H2a");
		expect(tree[0].children[0].children).toHaveLength(1);
		expect(tree[0].children[0].children[0].text).toBe("H3");
		expect(tree[0].children[1].text).toBe("H2b");
		expect(tree[0].children[1].children).toEqual([]);
	});

	it("handles sibling headings after nested children", () => {
		const headings: Heading[] = [
			{ depth: 2, text: "First", id: "first" },
			{ depth: 3, text: "Nested", id: "nested" },
			{ depth: 2, text: "Second", id: "second" },
		];

		const tree = buildTocTree(headings);

		expect(tree).toHaveLength(2);
		expect(tree[0].children).toHaveLength(1);
		expect(tree[1].text).toBe("Second");
		expect(tree[1].children).toEqual([]);
	});

	it("handles depth jumps (e.g. h2 directly to h4)", () => {
		const headings: Heading[] = [
			{ depth: 2, text: "H2", id: "h2" },
			{ depth: 4, text: "H4", id: "h4" },
		];

		const tree = buildTocTree(headings);

		expect(tree).toHaveLength(1);
		expect(tree[0].children).toHaveLength(1);
		expect(tree[0].children[0].text).toBe("H4");
	});

	it("preserves id and depth on nodes", () => {
		const headings: Heading[] = [{ depth: 2, text: "Section", id: "section" }];

		const tree = buildTocTree(headings);

		expect(tree[0].depth).toBe(2);
		expect(tree[0].id).toBe("section");
	});
});
