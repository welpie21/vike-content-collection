import { describe, expect, it } from "bun:test";
import { parseDataFile } from "../src/plugin/data-parser";

describe("parseDataFile", () => {
	describe("JSON files", () => {
		it("parses valid JSON", () => {
			const result = parseDataFile(
				'{"name": "Alice", "age": 30}',
				"/data/author.json",
			);

			expect(result.data).toEqual({ name: "Alice", age: 30 });
		});

		it("parses JSON with nested objects", () => {
			const result = parseDataFile(
				'{"user": {"name": "Bob", "roles": ["admin"]}}',
				"/data/user.json",
			);

			expect(result.data.user).toEqual({ name: "Bob", roles: ["admin"] });
		});

		it("throws for invalid JSON", () => {
			expect(() => parseDataFile("{invalid}", "/data/bad.json")).toThrow(
				/Failed to parse data file/,
			);
		});
	});

	describe("YAML files", () => {
		it("parses valid YAML", () => {
			const result = parseDataFile("name: Alice\nage: 30\n", "/data/author.yaml");

			expect(result.data).toEqual({ name: "Alice", age: 30 });
		});

		it("parses .yml extension", () => {
			const result = parseDataFile("title: Test\n", "/data/entry.yml");

			expect(result.data).toEqual({ title: "Test" });
		});

		it("parses nested YAML", () => {
			const yaml = "user:\n  name: Bob\n  roles:\n    - admin\n    - editor\n";
			const result = parseDataFile(yaml, "/data/user.yaml");

			expect(result.data.user).toEqual({ name: "Bob", roles: ["admin", "editor"] });
		});

		it("throws for invalid YAML", () => {
			const invalid = ":\n  - :\n  invalid:";
			expect(() => parseDataFile(invalid, "/data/bad.yaml")).toThrow();
		});
	});

	describe("TOML files", () => {
		it("parses valid TOML", () => {
			const result = parseDataFile(
				'name = "Alice"\nage = 30\n',
				"/data/author.toml",
			);

			expect(result.data).toEqual({ name: "Alice", age: 30 });
		});

		it("parses nested TOML tables", () => {
			const toml = '[user]\nname = "Bob"\nroles = ["admin", "editor"]\n';
			const result = parseDataFile(toml, "/data/user.toml");

			expect(result.data.user).toEqual({
				name: "Bob",
				roles: ["admin", "editor"],
			});
		});

		it("parses TOML with inline tables", () => {
			const toml = 'server = { host = "localhost", port = 8080 }\n';
			const result = parseDataFile(toml, "/data/config.toml");

			expect(result.data.server).toEqual({ host: "localhost", port: 8080 });
		});

		it("throws for invalid TOML", () => {
			const invalid = "[invalid\nkey = ";
			expect(() => parseDataFile(invalid, "/data/bad.toml")).toThrow(
				/Failed to parse data file/,
			);
		});
	});

	it("throws for unsupported file extension", () => {
		expect(() =>
			parseDataFile("content", "/data/file.txt"),
		).toThrow(/Unsupported data file extension/);
	});
});
