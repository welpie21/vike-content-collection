import { describe, expect, it } from "bun:test";
import { parseMarkdownFile } from "../src/plugin/markdown";

describe("parseMarkdownFile", () => {
	it("parses simple frontmatter", () => {
		const raw = `---
title: "Hello World"
author: "Jane"
---

Body content here.`;

		const result = parseMarkdownFile(raw, "/test/post.md");

		expect(result.frontmatter).toEqual({
			title: "Hello World",
			author: "Jane",
		});
		expect(result.content.trim()).toBe("Body content here.");
	});

	it("builds correct line map for flat keys", () => {
		const raw = `---
title: "Hello"
author: "Jane"
draft: true
---

Content.`;

		const result = parseMarkdownFile(raw, "/test/post.md");

		expect(result.lineMap.title).toBe(2);
		expect(result.lineMap.author).toBe(3);
		expect(result.lineMap.draft).toBe(4);
	});

	it("builds correct line map for nested keys", () => {
		const raw = `---
title: "Post"
metadata:
  name: "Jane"
  date: 2025-01-01
tags:
  primary: "tech"
---

Body.`;

		const result = parseMarkdownFile(raw, "/test/post.md");

		expect(result.lineMap.title).toBe(2);
		expect(result.lineMap.metadata).toBe(3);
		expect(result.lineMap["metadata.name"]).toBe(4);
		expect(result.lineMap["metadata.date"]).toBe(5);
		expect(result.lineMap.tags).toBe(6);
		expect(result.lineMap["tags.primary"]).toBe(7);
	});

	it("handles frontmatter with no body content", () => {
		const raw = `---
title: "Only frontmatter"
---`;

		const result = parseMarkdownFile(raw, "/test/post.md");

		expect(result.frontmatter).toEqual({ title: "Only frontmatter" });
		expect(result.content.trim()).toBe("");
	});

	it("handles empty frontmatter", () => {
		const raw = `---
---

Just body text.`;

		const result = parseMarkdownFile(raw, "/test/post.md");

		expect(result.frontmatter).toEqual({});
		expect(Object.keys(result.lineMap)).toHaveLength(0);
		expect(result.content.trim()).toBe("Just body text.");
	});

	it("handles deeply nested YAML", () => {
		const raw = `---
level1:
  level2:
    level3: "deep"
---

Content.`;

		const result = parseMarkdownFile(raw, "/test/post.md");

		expect(result.frontmatter).toEqual({
			level1: { level2: { level3: "deep" } },
		});
		expect(result.lineMap.level1).toBe(2);
		expect(result.lineMap["level1.level2"]).toBe(3);
		expect(result.lineMap["level1.level2.level3"]).toBe(4);
	});

	it("handles keys with hyphens and underscores", () => {
		const raw = `---
my-key: "value1"
my_key: "value2"
---

Content.`;

		const result = parseMarkdownFile(raw, "/test/post.md");

		expect(result.lineMap["my-key"]).toBe(2);
		expect(result.lineMap.my_key).toBe(3);
	});

	it("throws ContentCollectionError on invalid YAML", () => {
		const raw = `---
title: [invalid
---`;

		expect(() => parseMarkdownFile(raw, "/test/bad.md")).toThrow(
			/Failed to parse frontmatter/,
		);

		try {
			parseMarkdownFile(raw, "/test/bad.md");
		} catch (err) {
			expect((err as Error).name).toBe("ContentCollectionError");
		}
	});

	it("preserves the full markdown body after frontmatter", () => {
		const raw = `---
title: "Test"
---

# Heading

Paragraph with **bold** and *italic*.

- list item 1
- list item 2`;

		const result = parseMarkdownFile(raw, "/test/post.md");

		expect(result.content).toContain("# Heading");
		expect(result.content).toContain("**bold**");
		expect(result.content).toContain("- list item 1");
	});

	it("handles multiple sibling keys after a nested block", () => {
		const raw = `---
metadata:
  name: "Jane"
title: "After nested"
---

Content.`;

		const result = parseMarkdownFile(raw, "/test/post.md");

		expect(result.lineMap.metadata).toBe(2);
		expect(result.lineMap["metadata.name"]).toBe(3);
		expect(result.lineMap.title).toBe(4);
		expect(result.frontmatter.title).toBe("After nested");
	});
});
