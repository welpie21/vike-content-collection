import { z } from "zod";
import { parseDataFile } from "../src/plugin/data-parser";
import { parseMarkdownFile } from "../src/plugin/markdown";
import { validateMetadata } from "../src/plugin/validation";
import { suite } from "./runner";

const s = suite("plugin");

// ── Fixtures ────────────────────────────────────────────────

const smallMarkdown = `---
title: Hello World
date: 2025-01-15
draft: false
---

# Hello World

A short post.
`;

const largeMarkdown = `---
title: Comprehensive Guide to TypeScript
date: 2025-06-20
draft: false
author: John Doe
category: programming
tags:
  - typescript
  - javascript
  - web-development
  - tutorial
  - best-practices
series: typescript-mastery
seriesOrder: 3
description: An in-depth guide covering advanced TypeScript patterns, type-level programming, and real-world best practices.
image: /images/typescript-guide.png
readingTime: 15
featured: true
metadata:
  og_title: TypeScript Mastery Guide
  og_description: Learn advanced TypeScript patterns
  canonical: https://example.com/typescript-guide
---

# Comprehensive Guide to TypeScript

## Introduction

TypeScript has become the de facto standard for large-scale JavaScript applications.
In this guide, we'll explore advanced patterns and best practices.

## Type-Level Programming

TypeScript's type system is Turing-complete, allowing for powerful type-level computation.

### Conditional Types

${"Conditional types allow you to create types that depend on other types. ".repeat(20)}

### Mapped Types

${"Mapped types let you create new types based on existing ones by transforming each property. ".repeat(20)}

### Template Literal Types

${"Template literal types combine string literal types with union types for powerful string manipulation. ".repeat(20)}

## Real-World Patterns

### Builder Pattern

${"The builder pattern is particularly useful in TypeScript for creating fluent APIs with full type safety. ".repeat(15)}

### State Machines

${"Type-safe state machines ensure that only valid state transitions are possible at compile time. ".repeat(15)}

## Conclusion

${"TypeScript continues to evolve with each release, bringing more powerful type-level features. ".repeat(10)}
`;

const nestedMarkdown = `---
title: Nested Config
database:
  host: localhost
  port: 5432
  credentials:
    username: admin
    password: secret
  replicas:
    primary:
      host: primary.db.local
      port: 5432
    secondary:
      host: secondary.db.local
      port: 5433
logging:
  level: debug
  output:
    file: /var/log/app.log
    console: true
---

Content body here.
`;

const jsonData = JSON.stringify({
	title: "JSON Entry",
	date: "2025-03-01",
	tags: ["json", "data"],
	metadata: { views: 1200, rating: 4.5 },
	sections: Array.from({ length: 20 }, (_, i) => ({
		id: i,
		title: `Section ${i}`,
		content: "Lorem ipsum dolor sit amet ".repeat(10),
	})),
});

const yamlData = `title: YAML Entry
date: 2025-03-01
tags:
  - yaml
  - data
  - config
metadata:
  views: 1200
  rating: 4.5
sections:
${Array.from({ length: 20 }, (_, i) => `  - id: ${i}\n    title: Section ${i}\n    content: "${"Lorem ipsum dolor sit amet ".repeat(5)}"`).join("\n")}
`;

const tomlData = `title = "TOML Entry"
date = "2025-03-01"
tags = ["toml", "data", "config"]

[metadata]
views = 1200
rating = 4.5

${Array.from({ length: 20 }, (_, i) => `[[sections]]\nid = ${i}\ntitle = "Section ${i}"\ncontent = "${"Lorem ipsum dolor sit amet ".repeat(5)}"`).join("\n\n")}
`;

const simpleSchema = z.object({
	title: z.string(),
	date: z.date(),
	draft: z.boolean().optional(),
});

const complexSchema = z.object({
	title: z.string().min(1),
	date: z.date(),
	draft: z.boolean().optional(),
	author: z.string(),
	category: z.string(),
	tags: z.array(z.string()),
	series: z.string().optional(),
	seriesOrder: z.number().optional(),
	description: z.string(),
	image: z.string().optional(),
	readingTime: z.number(),
	featured: z.boolean().optional(),
	metadata: z
		.object({
			og_title: z.string(),
			og_description: z.string(),
			canonical: z.string().url(),
		})
		.optional(),
});

// Pre-parsed data for validation benchmarks
const simpleParsed = parseMarkdownFile(smallMarkdown, "small.md");
const complexParsed = parseMarkdownFile(largeMarkdown, "large.md");

// ── Benchmarks ──────────────────────────────────────────────

s.add("parseMarkdownFile (small)", () => {
	parseMarkdownFile(smallMarkdown, "test.md");
});

s.add("parseMarkdownFile (large)", () => {
	parseMarkdownFile(largeMarkdown, "test.md");
});

s.add("parseMarkdownFile (nested frontmatter)", () => {
	parseMarkdownFile(nestedMarkdown, "test.md");
});

s.add("parseDataFile (JSON)", () => {
	parseDataFile(jsonData, "data.json");
});

s.add("parseDataFile (YAML)", () => {
	parseDataFile(yamlData, "data.yaml");
});

s.add("parseDataFile (TOML)", () => {
	parseDataFile(tomlData, "data.toml");
});

s.add("validateMetadata (simple schema)", () => {
	validateMetadata(
		simpleParsed.metadata,
		simpleSchema,
		"test.md",
		simpleParsed.lineMap,
	);
});

s.add("validateMetadata (complex schema)", () => {
	validateMetadata(
		complexParsed.metadata,
		complexSchema,
		"test.md",
		complexParsed.lineMap,
	);
});

export default s;
