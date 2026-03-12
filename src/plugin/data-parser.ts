import { extname } from "node:path";
import matter from "gray-matter";
import { parse as parseToml } from "smol-toml";
import { ContentCollectionError } from "./errors.js";

/**
 * Parse a JSON, YAML, or TOML data file into a plain object.
 * For YAML files, we leverage gray-matter (already a dependency) by wrapping
 * content in frontmatter delimiters so its YAML engine handles parsing.
 */
export function parseDataFile(
	raw: string,
	filePath: string,
): { data: Record<string, unknown> } {
	const ext = extname(filePath).toLowerCase();

	try {
		if (ext === ".json") {
			return { data: JSON.parse(raw) as Record<string, unknown> };
		}

		if (ext === ".yaml" || ext === ".yml") {
			const wrapped = `---\n${raw}\n---\n`;
			const { data } = matter(wrapped);
			return { data: data as Record<string, unknown> };
		}

		if (ext === ".toml") {
			return { data: parseToml(raw) as Record<string, unknown> };
		}

		throw new Error(`Unsupported data file extension: ${ext}`);
	} catch (err) {
		if (err instanceof ContentCollectionError) throw err;
		throw new ContentCollectionError(
			`Failed to parse data file: ${err instanceof Error ? err.message : String(err)}`,
			filePath,
		);
	}
}
