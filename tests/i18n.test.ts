import { beforeEach, describe, expect, it } from "bun:test";
import {
	type Collection,
	getGlobalStore,
	resetGlobalStore,
} from "../src/plugin/collection-store";
import { getAvailableLocales, getLocalizedEntry } from "../src/runtime/i18n";

function makeI18nCollection(
	name: string,
	configDir: string,
	items: { slug: string; locale?: string }[],
): Collection {
	const entries = items.map((item) => ({
		filePath: `${configDir}/${item.slug}.md`,
		slug: item.slug,
		metadata: { title: item.slug, locale: item.locale },
		content: `Body of ${item.slug}`,
		computed: {},
		lastModified: undefined,
		_isDraft: false,
		lineMap: { title: 2 },
	}));

	return {
		name,
		type: "content" as const,
		configDir,
		configPath: `${configDir}/+Content.ts`,
		markdownDir: configDir,
		entries,
		index: new Map(entries.map((e) => [e.slug, e])),
	};
}

describe("getAvailableLocales", () => {
	beforeEach(() => {
		resetGlobalStore();
	});

	describe("suffix strategy", () => {
		it("finds locales from slug suffixes", () => {
			const store = getGlobalStore();
			store.set(
				"/pages/docs",
				makeI18nCollection("docs", "/pages/docs", [
					{ slug: "getting-started" },
					{ slug: "getting-started.fr" },
					{ slug: "getting-started.de" },
					{ slug: "other-page" },
				]),
			);

			const locales = getAvailableLocales("docs", "getting-started");

			expect(locales).toEqual(["", "de", "fr"]);
		});

		it("returns empty string for the base slug (default locale)", () => {
			const store = getGlobalStore();
			store.set(
				"/pages/docs",
				makeI18nCollection("docs", "/pages/docs", [
					{ slug: "intro" },
					{ slug: "intro.es" },
				]),
			);

			const locales = getAvailableLocales("docs", "intro");

			expect(locales).toContain("");
			expect(locales).toContain("es");
		});

		it("returns empty array when no matches exist", () => {
			const store = getGlobalStore();
			store.set(
				"/pages/docs",
				makeI18nCollection("docs", "/pages/docs", [{ slug: "unrelated" }]),
			);

			const locales = getAvailableLocales("docs", "missing");

			expect(locales).toEqual([]);
		});

		it("supports custom separator", () => {
			const store = getGlobalStore();
			store.set(
				"/pages/docs",
				makeI18nCollection("docs", "/pages/docs", [
					{ slug: "intro" },
					{ slug: "intro-fr" },
					{ slug: "intro-de" },
				]),
			);

			const locales = getAvailableLocales("docs", "intro", {
				separator: "-",
			});

			expect(locales).toEqual(["", "de", "fr"]);
		});
	});

	describe("metadata strategy", () => {
		it("finds locales from metadata field", () => {
			const store = getGlobalStore();
			store.set(
				"/pages/docs",
				makeI18nCollection("docs", "/pages/docs", [
					{ slug: "intro", locale: "en" },
					{ slug: "intro.fr", locale: "fr" },
					{ slug: "intro.de", locale: "de" },
				]),
			);

			const locales = getAvailableLocales("docs", "intro", {
				strategy: "metadata",
			});

			expect(locales).toEqual(["de", "en", "fr"]);
		});

		it("skips entries without the locale field", () => {
			const store = getGlobalStore();
			store.set(
				"/pages/docs",
				makeI18nCollection("docs", "/pages/docs", [
					{ slug: "intro", locale: "en" },
					{ slug: "intro.fr" },
				]),
			);

			const locales = getAvailableLocales("docs", "intro", {
				strategy: "metadata",
			});

			expect(locales).toEqual(["en"]);
		});
	});
});

describe("getLocalizedEntry", () => {
	beforeEach(() => {
		resetGlobalStore();
	});

	describe("suffix strategy", () => {
		it("returns the localized entry by slug suffix", () => {
			const store = getGlobalStore();
			store.set(
				"/pages/docs",
				makeI18nCollection("docs", "/pages/docs", [
					{ slug: "intro" },
					{ slug: "intro.fr" },
				]),
			);

			const entry = getLocalizedEntry("docs", "intro", "fr");

			expect(entry?.slug).toBe("intro.fr");
		});

		it("returns base slug entry for empty locale", () => {
			const store = getGlobalStore();
			store.set(
				"/pages/docs",
				makeI18nCollection("docs", "/pages/docs", [
					{ slug: "intro" },
					{ slug: "intro.fr" },
				]),
			);

			const entry = getLocalizedEntry("docs", "intro", "");

			expect(entry?.slug).toBe("intro");
		});

		it("returns undefined when locale not found", () => {
			const store = getGlobalStore();
			store.set(
				"/pages/docs",
				makeI18nCollection("docs", "/pages/docs", [{ slug: "intro" }]),
			);

			const entry = getLocalizedEntry("docs", "intro", "jp");

			expect(entry).toBeUndefined();
		});
	});

	describe("metadata strategy", () => {
		it("returns entry matching locale in metadata field", () => {
			const store = getGlobalStore();
			store.set(
				"/pages/docs",
				makeI18nCollection("docs", "/pages/docs", [
					{ slug: "intro", locale: "en" },
					{ slug: "intro.fr", locale: "fr" },
				]),
			);

			const entry = getLocalizedEntry("docs", "intro", "fr", {
				strategy: "metadata",
			});

			expect(entry?.slug).toBe("intro.fr");
		});

		it("returns undefined when no entry matches locale", () => {
			const store = getGlobalStore();
			store.set(
				"/pages/docs",
				makeI18nCollection("docs", "/pages/docs", [
					{ slug: "intro", locale: "en" },
				]),
			);

			const entry = getLocalizedEntry("docs", "intro", "fr", {
				strategy: "metadata",
			});

			expect(entry).toBeUndefined();
		});
	});
});
