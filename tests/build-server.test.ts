import { describe, expect, it } from "bun:test";
import { createServer } from "vite";
import { createBuildServerConfig } from "../src/plugin/vite-plugin";

describe("createBuildServerConfig", () => {
	it("disables the file watcher and HMR websocket", () => {
		const config = createBuildServerConfig("/project", {});
		expect(config.server).toEqual({
			middlewareMode: true,
			watch: null,
			ws: false,
		});
	});

	it("does not load the project's vite config", () => {
		const config = createBuildServerConfig("/project", {});
		expect(config.root).toBe("/project");
		expect(config.configFile).toBe(false);
	});

	it("maps aliases to resolve entries", () => {
		const config = createBuildServerConfig("/project", { "~": "/project/src" });
		expect(config.resolve).toEqual({
			alias: [{ find: "~", replacement: "/project/src" }],
		});
	});

	it("omits resolve when there are no aliases", () => {
		const config = createBuildServerConfig("/project", {});
		expect(config.resolve).toBeUndefined();
	});

	it("creates a server without a watcher", async () => {
		const server = await createServer(
			createBuildServerConfig(process.cwd(), {}),
		);
		try {
			expect(server.watcher.getWatched()).toEqual({});
		} finally {
			await server.close();
		}
	});
});
