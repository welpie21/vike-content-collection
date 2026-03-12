import GithubSlugger from "github-slugger";
import type { Root as MdastRoot } from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkMdx from "remark-mdx";
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
 * Create an MDX renderer that handles `.mdx` files with JSX syntax.
 *
 * Uses `remark-mdx` to parse MDX syntax within the unified pipeline.
 * JSX elements are serialized as their HTML tag equivalents in the output.
 * For full JSX component evaluation, implement a custom `ContentRenderer`.
 *
 * Optionally pass default remark/rehype plugins that are always applied.
 */
export function createMdxRenderer(
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
				rehypeRaw,
				rehypeSlug,
				...(defaults.rehypePlugins ?? []),
				...(options.rehypePlugins ?? []),
			];

			let processor: any = unified().use(remarkParse).use(remarkMdx);

			for (const plugin of remarkPlugins) {
				processor = processor.use(plugin);
			}

			processor = processor.use(remarkRehype, { allowDangerousHtml: true });

			for (const plugin of rehypePlugins) {
				processor = processor.use(plugin);
			}

			processor = processor.use(rehypeStringify, {
				allowDangerousHtml: true,
			});

			const result = await processor.process(content);
			return { html: String(result), headings };
		},
	};
}
