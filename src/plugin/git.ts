import { execSync } from "node:child_process";
import { dirname } from "node:path";

/**
 * Retrieve the last commit date for a file using git log.
 * Returns undefined if git is not available or the file is untracked.
 */
export function getLastModified(filePath: string): Date | undefined {
	try {
		const output = execSync(`git log -1 --format=%cI -- "${filePath}"`, {
			cwd: dirname(filePath),
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();

		if (!output) return undefined;
		const date = new Date(output);
		return Number.isNaN(date.getTime()) ? undefined : date;
	} catch {
		return undefined;
	}
}
