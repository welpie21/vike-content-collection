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
	MdxRendererOptions,
	RenderResult,
} from "../../types/index.js";

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrite import paths in MDX source based on alias configuration.
 * Handles `import X from '@/foo'`, `import { X } from '@/foo'`,
 * `export { X } from '@/foo'`, and `import('@/foo')`.
 */
function rewriteImports(
	content: string,
	aliases: Record<string, string>,
): string {
	let result = content;
	for (const [alias, replacement] of Object.entries(aliases)) {
		const escaped = escapeRegExp(alias);
		const fromPattern = new RegExp(
			`(from\\s+['"])${escaped}(/[^'"]*)?(['"])`,
			"g",
		);
		result = result.replace(fromPattern, `$1${replacement}$2$3`);
		const dynamicPattern = new RegExp(
			`(import\\s*\\(\\s*['"])${escaped}(/[^'"]*)?(['"])`,
			"g",
		);
		result = result.replace(dynamicPattern, `$1${replacement}$2$3`);
	}
	return result;
}

/**
 * Create an MDX renderer that handles `.mdx` files with JSX syntax.
 *
 * **HTML mode (default):** Uses `remark-mdx` in the unified pipeline.
 * JSX elements are serialized as their HTML tag equivalents.
 *
 * **Evaluate mode:** When `evaluate` is provided, uses `@mdx-js/mdx` to
 * compile and evaluate MDX with full JSX component rendering. Requires
 * `@mdx-js/mdx` as a peer dependency.
 *
 * Pass `resolve.alias` to rewrite import paths (e.g. `@/components/Button`)
 * to absolute paths before compilation. Only used in evaluate mode.
 */
export function createMdxRenderer(
	defaults: MdxRendererOptions = {},
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

			if (defaults.evaluate) {
				return renderWithEvaluation(
					content,
					headings,
					remarkExtractHeadings,
					defaults,
					options,
				);
			}

			return renderAsHtml(
				content,
				headings,
				remarkExtractHeadings,
				defaults,
				options,
			);
		},
	};
}

async function renderAsHtml(
	content: string,
	headings: Heading[],
	remarkExtractHeadings: any,
	defaults: MdxRendererOptions,
	options: { remarkPlugins?: any[]; rehypePlugins?: any[] },
): Promise<RenderResult> {
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

	processor = processor.use(rehypeStringify, { allowDangerousHtml: true });

	const result = await processor.process(content);
	return { html: String(result), headings };
}

async function renderWithEvaluation(
	content: string,
	headings: Heading[],
	remarkExtractHeadings: any,
	defaults: MdxRendererOptions,
	options: { remarkPlugins?: any[]; rehypePlugins?: any[] },
): Promise<RenderResult> {
	const evalOpts = defaults.evaluate as NonNullable<typeof defaults.evaluate>;

	let mdxCompile: any;
	let mdxRun: any;
	try {
		const mdxModule = await import("@mdx-js/mdx");
		mdxCompile = mdxModule.compile;
		mdxRun = mdxModule.run;
	} catch {
		throw new Error(
			"[vike-content-collection] @mdx-js/mdx is required for MDX evaluate mode. " +
				"Install it with: npm install @mdx-js/mdx",
		);
	}

	let processedContent = content;
	if (defaults.resolve?.alias) {
		processedContent = rewriteImports(content, defaults.resolve.alias);
	}

	const remarkPlugins: any[] = [
		remarkExtractHeadings,
		...(defaults.remarkPlugins ?? []),
		...(options.remarkPlugins ?? []),
	];
	const rehypePlugins: any[] = [
		...(defaults.rehypePlugins ?? []),
		...(options.rehypePlugins ?? []),
	];

	const compiled = await mdxCompile(processedContent, {
		outputFormat: "function-body",
		remarkPlugins,
		rehypePlugins,
	});

	const code = String(compiled);
	const baseUrl = evalOpts.baseUrl ?? import.meta.url;

	const mdxModule = await mdxRun(code, {
		jsx: evalOpts.jsx,
		jsxs: evalOpts.jsxs,
		Fragment: evalOpts.Fragment,
		baseUrl,
		useMDXComponents: evalOpts.components
			? () => evalOpts.components as Record<string, any>
			: undefined,
	});

	const Component = mdxModule.default;
	const html = await evalOpts.renderToHtml(Component);

	return { html, headings };
}
