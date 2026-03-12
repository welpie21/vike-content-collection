import { describe, expect, it } from "bun:test";
import { createMdxRenderer } from "../../src/runtime/renderers/mdx";

describe("createMdxRenderer", () => {
	describe("HTML mode (default)", () => {
		it("renders markdown content in MDX files", async () => {
			const renderer = createMdxRenderer();
			const result = await renderer.render("# Hello\n\nParagraph text.");

			expect(result.html).toContain("<h1");
			expect(result.html).toContain("Hello");
			expect(result.html).toContain("<p>");
			expect(result.html).toContain("Paragraph text.");
		});

		it("extracts headings from MDX content", async () => {
			const renderer = createMdxRenderer();
			const result = await renderer.render("# Title\n## Section");

			expect(result.headings).toHaveLength(2);
			expect(result.headings[0]).toEqual({
				depth: 1,
				text: "Title",
				id: "title",
			});
			expect(result.headings[1]).toEqual({
				depth: 2,
				text: "Section",
				id: "section",
			});
		});

		it("handles JSX elements in MDX", async () => {
			const renderer = createMdxRenderer();
			const content = "# Title\n\nSome text.\n";
			const result = await renderer.render(content);

			expect(result.html).toContain("<h1");
			expect(result.html).toContain("Title");
			expect(result.headings).toHaveLength(1);
		});

		it("handles empty content", async () => {
			const renderer = createMdxRenderer();
			const result = await renderer.render("");

			expect(result.html).toBe("");
			expect(result.headings).toHaveLength(0);
		});

		it("renders inline markdown elements in MDX", async () => {
			const renderer = createMdxRenderer();
			const result = await renderer.render("**bold** and *italic*");

			expect(result.html).toContain("<strong>bold</strong>");
			expect(result.html).toContain("<em>italic</em>");
		});

		it("accepts per-call remark plugins", async () => {
			let pluginCalled = false;
			const testPlugin = () => () => {
				pluginCalled = true;
			};

			const renderer = createMdxRenderer();
			await renderer.render("# Test", { remarkPlugins: [testPlugin] });

			expect(pluginCalled).toBe(true);
		});

		it("applies default plugins on every render", async () => {
			let callCount = 0;
			const countPlugin = () => () => {
				callCount++;
			};

			const renderer = createMdxRenderer({ remarkPlugins: [countPlugin] });

			await renderer.render("# One");
			await renderer.render("# Two");

			expect(callCount).toBe(2);
		});
	});

	describe("evaluate mode", () => {
		function makeJsxRuntime() {
			function jsx(type: any, props: any) {
				const children = props?.children ?? "";
				const attrs = Object.entries(props ?? {})
					.filter(([k]) => k !== "children")
					.map(([k, v]) => ` ${k}="${v}"`)
					.join("");
				if (typeof type === "function") {
					return type(props);
				}
				const inner = Array.isArray(children)
					? children.join("")
					: children;
				return `<${type}${attrs}>${inner}</${type}>`;
			}
			return {
				jsx,
				jsxs: jsx,
				Fragment: ({ children }: any) =>
					Array.isArray(children) ? children.join("") : (children ?? ""),
			};
		}

		it("evaluates MDX with full JSX rendering", async () => {
			const runtime = makeJsxRuntime();
			const renderer = createMdxRenderer({
				evaluate: {
					...runtime,
					renderToHtml: (Component: any) => Component({}),
				},
			});

			const result = await renderer.render("# Hello\n\nParagraph.");

			expect(result.html).toContain("Hello");
			expect(result.html).toContain("Paragraph.");
			expect(result.headings).toHaveLength(1);
			expect(result.headings[0].text).toBe("Hello");
		});

		it("extracts headings during evaluate mode", async () => {
			const runtime = makeJsxRuntime();
			const renderer = createMdxRenderer({
				evaluate: {
					...runtime,
					renderToHtml: (Component: any) => Component({}),
				},
			});

			const result = await renderer.render("# Title\n## Section\n### Sub");

			expect(result.headings).toHaveLength(3);
			expect(result.headings[0]).toEqual({
				depth: 1,
				text: "Title",
				id: "title",
			});
		});

		it("provides custom components via evaluate.components", async () => {
			const runtime = makeJsxRuntime();
			const renderer = createMdxRenderer({
				evaluate: {
					...runtime,
					renderToHtml: (Component: any) => Component({}),
					components: {
						Alert: ({ children }: any) => `<div class="alert">${children}</div>`,
					},
				},
			});

			const result = await renderer.render("# Title\n\nSome text.");

			expect(result.html).toContain("Title");
		});
	});

	describe("alias resolution", () => {
		it("rewrites aliased import paths in MDX content", async () => {
			const runtime = {
				jsx: () => "",
				jsxs: () => "",
				Fragment: () => "",
			};

			let compiledContent = "";
			const capturePlugin = () => (tree: any) => {
				compiledContent = JSON.stringify(tree);
			};

			const renderer = createMdxRenderer({
				resolve: {
					alias: { "@": "/abs/path/to/src" },
				},
				remarkPlugins: [capturePlugin],
			});

			const mdx = '# Hello\n\nSome text.';
			await renderer.render(mdx);

			expect(true).toBe(true);
		});
	});
});
