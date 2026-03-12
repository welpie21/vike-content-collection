import GithubSlugger from "github-slugger";
import type { Root as MdastRoot } from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type {
	ContentRenderer,
	Heading,
	RenderOptions,
	RenderResult,
} from "../../types/index.js";

/**
 * Create a markdown renderer powered by unified/remark/rehype.
 * Optionally pass default remark/rehype plugins that are always applied.
 */
export function createMarkdownRenderer(
	defaults: Omit<RenderOptions, "renderer"> = {},
): ContentRenderer {
	return {
		async render(content, options = {}): Promise<RenderResult> {
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

			const remarkPlugins: any[] = [
				remarkExtractHeadings,
				...(defaults.remarkPlugins ?? []),
				...(options.remarkPlugins ?? []),
			];
			const rehypePlugins: any[] = [
				rehypeSlug,
				...(defaults.rehypePlugins ?? []),
				...(options.rehypePlugins ?? []),
			];

			let processor: any = unified().use(remarkParse);

			for (const plugin of remarkPlugins) {
				processor = processor.use(plugin);
			}

			processor = processor.use(remarkRehype);

			for (const plugin of rehypePlugins) {
				processor = processor.use(plugin);
			}

			processor = processor.use(rehypeStringify);

			const result = await processor.process(content);
			return { html: String(result), headings };
		},
	};
}
