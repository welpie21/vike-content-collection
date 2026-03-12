import matter from "gray-matter";
import { ContentCollectionError } from "./errors.js";

export interface MetadataLineMap {
	/** Maps a dot-separated metadata key path to its 1-based line number in the source file */
	[keyPath: string]: number;
}

export interface ParsedMarkdown {
	metadata: Record<string, unknown>;
	content: string;
	lineMap: MetadataLineMap;
}

/**
 * Build a map from YAML key paths to their 1-based line numbers.
 * Handles flat and nested keys (e.g. "title" -> 2, "metadata.name" -> 4).
 */
function buildLineMap(raw: string): MetadataLineMap {
	const lines = raw.split("\n");
	const map: MetadataLineMap = {};
	const fencePattern = /^---\s*$/;

	let insideFrontmatter = false;
	let frontmatterStartLine = -1;
	const indentStack: { indent: number; prefix: string }[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (!insideFrontmatter) {
			if (fencePattern.test(line.trim())) {
				insideFrontmatter = true;
				frontmatterStartLine = i;
			}
			continue;
		}

		if (i !== frontmatterStartLine && fencePattern.test(line.trim())) {
			break;
		}

		if (line.trim() === "" || line.trim().startsWith("#")) continue;

		const match = line.match(/^(\s*)([a-zA-Z0-9_-]+)\s*:/);
		if (!match) continue;

		const indent = match[1].length;
		const key = match[2];
		const lineNumber = i + 1;

		while (
			indentStack.length > 0 &&
			indentStack[indentStack.length - 1].indent >= indent
		) {
			indentStack.pop();
		}

		const prefix =
			indentStack.length > 0
				? `${indentStack[indentStack.length - 1].prefix}.${key}`
				: key;

		map[prefix] = lineNumber;
		indentStack.push({ indent, prefix });
	}

	return map;
}

export function parseMarkdownFile(
	raw: string,
	filePath: string,
): ParsedMarkdown {
	try {
		const { data, content } = matter(raw);
		const lineMap = buildLineMap(raw);
		return { metadata: data, content, lineMap };
	} catch (err) {
		throw new ContentCollectionError(
			`Failed to parse frontmatter: ${err instanceof Error ? err.message : String(err)}`,
			filePath,
		);
	}
}
