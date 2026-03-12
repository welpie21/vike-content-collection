import GithubSlugger from "github-slugger";
import type { Root as MdastRoot } from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { TypedCollectionEntry } from "../types/index.js";

export interface Heading {
	depth: number;
	text: string;
	id: string;
}

export interface RenderResult {
	html: string;
	headings: Heading[];
}

export interface RenderOptions {
	remarkPlugins?: any[];
	rehypePlugins?: any[];
}

/**
 * Render a collection entry's markdown content to HTML and extract headings.
 */
export async function renderEntry<T>(
	entry: TypedCollectionEntry<T>,
	options: RenderOptions = {},
): Promise<RenderResult> {
	const headings: Heading[] = [];
	const slugger = new GithubSlugger();

	const remarkExtractHeadings = () => {
		return (tree: MdastRoot) => {
			visit(tree, "heading", (node) => {
				const text = mdastToString(node);
				headings.push({
					depth: node.depth,
					text,
					id: slugger.slug(text),
				});
			});
		};
	};

	// Build the pipeline as a single chain to keep unified's types happy.
	const remarkPlugins: any[] = [
		remarkExtractHeadings,
		...(options.remarkPlugins ?? []),
	];
	const rehypePlugins: any[] = [rehypeSlug, ...(options.rehypePlugins ?? [])];

	let processor: any = unified().use(remarkParse);

	for (const plugin of remarkPlugins) {
		processor = processor.use(plugin);
	}

	processor = processor.use(remarkRehype);

	for (const plugin of rehypePlugins) {
		processor = processor.use(plugin);
	}

	processor = processor.use(rehypeStringify);

	const result = await processor.process(entry.content);
	return {
		html: String(result),
		headings,
	};
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
