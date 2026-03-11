import type { ZodError, ZodSchema } from "zod";
import type { ValidationIssue } from "./errors.js";
import { throwValidationError } from "./errors.js";
import type { FrontmatterLineMap } from "./markdown.js";

/**
 * Validate frontmatter data against a zod schema.
 * On failure, maps each zod issue back to its line in the markdown file
 * and throws a formatted error that halts the build.
 */
export function validateFrontmatter(
	frontmatter: Record<string, unknown>,
	schema: ZodSchema,
	filePath: string,
	lineMap: FrontmatterLineMap,
): Record<string, unknown> {
	const result = schema.safeParse(frontmatter);

	if (result.success) {
		return result.data as Record<string, unknown>;
	}

	const issues = mapZodErrors(result.error, filePath, lineMap);
	throwValidationError(issues);
}

function mapZodErrors(
	error: ZodError,
	filePath: string,
	lineMap: FrontmatterLineMap,
): ValidationIssue[] {
	return error.issues.map((issue) => {
		const keyPath = issue.path.join(".");
		const line = findLineForPath(keyPath, lineMap);

		return {
			message: issue.message,
			path: issue.path,
			filePath,
			line,
		};
	});
}

/**
 * Walk up the key path to find the most specific line mapping.
 * E.g. for path "metadata.name", try "metadata.name" first, then "metadata".
 */
function findLineForPath(
	keyPath: string,
	lineMap: FrontmatterLineMap,
): number | undefined {
	if (keyPath === "") return undefined;

	if (lineMap[keyPath] != null) return lineMap[keyPath];

	const parts = keyPath.split(".");
	while (parts.length > 1) {
		parts.pop();
		const parentPath = parts.join(".");
		if (lineMap[parentPath] != null) return lineMap[parentPath];
	}

	return undefined;
}
