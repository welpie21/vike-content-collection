import GithubSlugger from "github-slugger";
import type { Root as MdastRoot } from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
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

/**
 * Extract headings from raw markdown without performing a full HTML render.
 */
export async function extractHeadings(content: string): Promise<Heading[]> {
	const headings: Heading[] = [];
	const slugger = new GithubSlugger();

	const tree = unified().use(remarkParse).parse(content);

	visit(tree as MdastRoot, "heading", (node) => {
		const text = mdastToString(node);
		headings.push({
			depth: node.depth,
			text,
			id: slugger.slug(text),
		});
	});

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
