import GithubSlugger from "github-slugger";
import type {
	ContentRenderer,
	Heading,
	RenderOptions,
	RenderResult,
	TocNode,
	TypedCollectionEntry,
} from "../types/index.js";
import { createMarkdownRenderer } from "./renderers/markdown.js";

export type { Heading, RenderOptions, RenderResult } from "../types/index.js";

let defaultRenderer: ContentRenderer | null = null;

function getDefaultRenderer(): ContentRenderer {
	if (!defaultRenderer) {
		defaultRenderer = createMarkdownRenderer();
	}
	return defaultRenderer;
}

/**
 * Render a collection entry's content to HTML and extract headings.
 *
 * Uses the built-in markdown renderer by default. Pass a custom renderer
 * via `options.renderer` to use a different rendering pipeline (e.g. MDX).
 */
export async function renderEntry<T>(
	entry: TypedCollectionEntry<T>,
	options: RenderOptions = {},
): Promise<RenderResult> {
	const { renderer: customRenderer, ...pluginOptions } = options;
	const renderer = customRenderer ?? getDefaultRenderer();
	return renderer.render(entry.content, pluginOptions);
}

const headingPattern = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/;
const codeBlockPattern = /^(`{3,}|~{3,})/;

function stripInlineFormatting(raw: string): string {
	return raw
		.replace(/\*\*(.+?)\*\*/g, "$1")
		.replace(/__(.+?)__/g, "$1")
		.replace(/\*(.+?)\*/g, "$1")
		.replace(/_(.+?)_/g, "$1")
		.replace(/~~(.+?)~~/g, "$1")
		.replace(/`(.+?)`/g, "$1")
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.trim();
}

/**
 * Extract headings from raw markdown without performing a full HTML render.
 *
 * Uses a direct line scan instead of building a full AST, skipping
 * fenced code blocks. Inline markdown formatting is stripped to produce
 * plain-text heading labels.
 */
export function extractHeadings(content: string): Heading[] {
	const headings: Heading[] = [];
	const slugger = new GithubSlugger();
	const lines = content.split("\n");
	let inCodeBlock = false;

	for (const line of lines) {
		if (codeBlockPattern.test(line)) {
			inCodeBlock = !inCodeBlock;
			continue;
		}
		if (inCodeBlock) continue;

		const match = headingPattern.exec(line);
		if (match) {
			const text = stripInlineFormatting(match[2]);
			headings.push({
				depth: match[1].length,
				text,
				id: slugger.slug(text),
			});
		}
	}

	return headings;
}

/**
 * Convert a flat array of headings into a nested tree structure.
 *
 * Uses a stack to track the current nesting depth. Each heading becomes a
 * child of the nearest preceding heading with a shallower depth.
 */
export function buildTocTree(headings: Heading[]): TocNode[] {
	const root: TocNode[] = [];
	const stack: { depth: number; children: TocNode[] }[] = [
		{ depth: 0, children: root },
	];

	for (const heading of headings) {
		const node: TocNode = {
			depth: heading.depth,
			text: heading.text,
			id: heading.id,
			children: [],
		};

		while (stack.length > 1 && stack[stack.length - 1].depth >= heading.depth) {
			stack.pop();
		}

		stack[stack.length - 1].children.push(node);
		stack.push({ depth: heading.depth, children: node.children });
	}

	return root;
}
