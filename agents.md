# agents.md — vike-content-collection

## Project Overview

A Vite plugin that provides type-safe, schema-validated content collections for Vike. Users define Zod schemas, drop in markdown/MDX/data files, and get fully typed content with validated frontmatter at dev and build time.

## Tech Stack

- **Language:** TypeScript (strict mode, ES2022, NodeNext modules)
- **Build:** `tsc` (output to `dist/`)
- **Runtime:** Node.js >= 18
- **Test runner:** Bun (`bun test`)
- **Linter/Formatter:** Biome (tabs, double quotes, recommended rules)
- **Peer dependencies:** Vite >= 7, Vike >= 0.4.250, Zod >= 3, @mdx-js/mdx >= 3 (optional)

## Project Structure

```
src/
├── index.ts              # Public API re-exports
├── config.ts             # Vike config extension
├── plugin/               # Vite plugin internals (build-time)
│   ├── vite-plugin.ts    # Main Vite plugin factory
│   ├── collection-store.ts
│   ├── data-parser.ts
│   ├── errors.ts
│   ├── generate-types.ts
│   ├── git.ts
│   ├── markdown.ts
│   ├── reference-validator.ts
│   └── validation.ts
├── runtime/              # Runtime APIs (used by consuming apps)
│   ├── get-collection.ts
│   ├── helpers.ts
│   ├── reference.ts
│   ├── render.ts
│   └── renderers/
│       ├── markdown.ts
│       └── mdx.ts
└── types/
    ├── index.ts
    └── Config.ts

tests/                    # Unit tests (mirror src/ structure)
docs/                     # User-facing documentation guides
```

## Rules

### 1. Keep Documentation in Sync

When code is changed, added, or removed, update **all** of the following to reflect the change:

- `docs/*.md` (the relevant guide)
- `README.md`
- `llms.txt`
- `llms-full.txt`

These files must stay accurate and consistent with the actual implementation. If a public API, option, type, or behavior changes, every documentation surface must be updated in the same change.

### 2. Keep Tests in Sync

When code is changed, added, or removed, update the corresponding unit tests in `tests/`. The test file structure mirrors `src/`:

| Source file | Test file |
| --- | --- |
| `src/plugin/collection-store.ts` | `tests/collection-store.test.ts` |
| `src/plugin/validation.ts` | `tests/validation.test.ts` |
| `src/runtime/render.ts` | `tests/render.test.ts` |
| `src/runtime/renderers/markdown.ts` | `tests/renderers/markdown.test.ts` |
| `src/runtime/renderers/mdx.ts` | `tests/renderers/mdx.test.ts` |
| *(and so on for every module)* | |

- New functionality must have corresponding tests.
- Modified behavior must have its tests updated to match.
- Removed functionality must have its tests removed.
- Run `bun test` to verify all tests pass before considering a change complete.

### 3. Apply SOLID Principles

All code must follow the SOLID principles:

- **Single Responsibility:** Each module, class, and function should have one reason to change. Keep plugin internals, runtime APIs, renderers, and types in their own files.
- **Open/Closed:** Extend behavior through composition (e.g., custom renderers via the `ContentRenderer` interface, remark/rehype plugins) rather than modifying existing code.
- **Liskov Substitution:** Any implementation of `ContentRenderer` must be interchangeable with the built-in renderers without breaking `renderEntry()`.
- **Interface Segregation:** Keep type interfaces focused. Don't force consumers to depend on types they don't use.
- **Dependency Inversion:** High-level modules (runtime APIs) should depend on abstractions (interfaces/types), not concrete implementations.

## Coding Conventions

- Use **tabs** for indentation and **double quotes** for strings (enforced by Biome).
- Run `biome check .` (or `npm run lint`) to verify linting before finishing.
- Prefer named exports. The main `src/index.ts` re-exports the public API.
- Type exports go in `src/types/`. Runtime code should import types from there.
- Keep `src/plugin/` (build-time Vite plugin code) and `src/runtime/` (consumer-facing APIs) cleanly separated.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Watch mode compilation |
| `bun test` | Run all unit tests |
| `npm run lint` | Check linting (Biome) |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Auto-format code (Biome) |
