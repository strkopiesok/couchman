# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

`couchman` is a CLI tool for managing CouchDB 3 design documents as files in a git repository. It builds design documents from a directory tree, diffs them against the database, and applies changes after confirmation (the Terraform model). It handles views, filters, updates, shows, lists, `validate_doc_update`, and Clouseau search indexes.

Requires **Node.js 22 LTS** or newer.

## Commands

```bash
npm test                  # unit tests
npm run test:integration  # integration tests against CouchDB+Clouseau in Docker (testcontainers)
```

CLI (via `npx couchman`):

```bash
couchman plan      [--env] [--db] [--ddoc]
couchman push      [--env] [--yes] [--prune]
couchman pull      --db [--out]
couchman validate                              # offline; run in CI on every PR
couchman warm      [--views] [--indexes] [--db]
couchman info      [--db]
couchman watch     [--env=local]
couchman promote   <from> <to> [--db]
couchman fixtures  push [--db]
couchman new       view|index <db>/<ddoc>/<name>
```

Global flags: `--env`, `--json`, `--verbose`, `--strict`, `--continue-on-error`.

Exit codes: `0` no changes, `2` changes pending (useful in CI), `1` error.

## File layout convention

```
couch/
  couchman.config.js               environments, database allowlist
  databases/
    <db>/
      <ddoc>/                      → _design/<ddoc>
        meta.json                  language, options, autoupdate, builtin reduces, analyzers
        views/<name>/map.js [reduce.js]
        indexes/<name>/index.js [meta.json]
        filters/<name>.js
        updates/<name>.js
        validate_doc_update.js
      _lib/                        shared code for this database only
  shared/                          shared code across all databases
  fixtures/<db>/seed.json
```

Rules enforced by the tool:
- A directory is a map of functions (`views`, `indexes`, `filters`, etc.)
- A file at the design-doc root is a scalar field (`validate_doc_update.js`, `rewrites.json`)
- `meta.json` is the only place for non-script fields
- Unknown directory or extension is an **error**, not a silent skip
- Files/dirs starting with `.` or `_` are ignored, **except** `_lib`
- Path segments are normalized to **NFC** (macOS returns NFD, Linux NFC — both produce identical view names)

## Architecture decisions

**Bundling** (`src/bundle/`): Shared code uses real ES module imports bundled with esbuild (`bundle.js`, `resolve-plugin.js`). Imports must resolve inside `_lib/` or `shared/` — nothing from `node_modules` because the CouchDB query server has none. Legacy `//INCLUDE:file:DONE` directives are still expanded (`legacy-include.js`) with a deprecation warning. Two output wrapper forms: default IIFE, or `--wrap=inline` (a plain `function(){…}` literal).

**ES5 transpilation**: esbuild bundles and resolves modules, but **cannot lower most ES6 syntax to ES5** (it errors on `const`, arrow functions, destructuring, spread, `for…of`, classes, async at `target: es5`). So the pipeline is **esbuild (bundle → CJS) → Babel `@babel/preset-env` (targets ie11) → wrap**. Babel does the real ES5 work. Note esbuild/Babel lower *syntax* only — runtime built-ins (`Array.prototype.includes`, `String.prototype.normalize`, …) are not polyfilled; document that limit. Both wrapper forms are verified to execute in a real SpiderMonkey query server.

**Write safety**: `couchman` only manages design documents it created. Each managed doc carries `"couchman": { "managed": true, "source": "...", "pushed_at": "...", "git_sha": "..." }`. Unmanaged docs are never deleted. Deleting managed docs requires `--prune` and confirmation by name. Every write carries the `_rev` from the plan — a conflict is an error, not a retry.

**Change cost**: The plan distinguishes rebuild cost: view changes trigger a view rebuild; index function or analyzer changes trigger a full Lucene rebuild (can take hours). Rebuild-triggering changes get a second confirmation prompt on `push`.

**Protected environments**: `protected: true` in config requires typing the environment name; `--yes` alone is not sufficient.

**Normalization**: Files are read as UTF-8, BOM stripped, CRLF normalized to LF before comparison. This prevents phantom diffs from Windows commits.

**`shared/normalize.js`**: Utility module bundled with the tool: `deaccent(s)`, `fold(s)`, `tokenize(s)`. Uses a **static lookup table** instead of `String.prototype.normalize("NFD")` because that method may not exist in the query server (a library like `normalize-text` that calls `.normalize()` silently returns text unchanged there). The table is vendored from `remove-accents` (map-based, no `.normalize()`); regenerate with `npm run gen:normalize` — do not hand-edit.

## Code layout

- `src/cli.js`, `src/commands/*` — commander CLI; each command is a thin handler over a pure/injectable core.
- `src/action.js` — `makeAction` wrapper: builds `{opts, logger, cwd}`, maps `CouchmanError` → clean stderr + exit code.
- `src/tree/` — walk + assemble design docs (`assemble.js` takes a `buildFn`: raw text, or bundled ES5).
- `src/build/build.js` — assemble + bundle every ddoc (heart of `validate`/`plan`/`push`).
- `src/plan/` — `diff.js` (cost classification + LCS unified diff), `plan.js` (`buildPlan`, pure), `format.js`.
- `src/push/` — `apply.js` (`applyPlan`, injected client + confirm), `run.js` (shared push pipeline for `push` and `watch`), `marker.js`, `alias.js`.
- `src/couch/client.js` — thin `nano` wrapper (only exercised in real/integration runs; unit tests use fakes).
- `src/config/` — `zod` schema + `defineConfig` + loader; `src/pull/`, `src/fixtures/`, `src/watch/`.

Pure logic is unit-tested with fake clients (`npm test`). Real CouchDB behaviour (query-server execution, Clouseau search, conflicts, blue/green, fixtures, pull) is covered by `test/integration/` via the actual CLI (`npm run test:integration`): it uses `COUCHMAN_IT_URL` if set, otherwise starts CouchDB+Clouseau with testcontainers (needs Docker). `vitest.config.js` keeps integration out of the unit run.

## Testing layers

Three layers must stay green:
1. **Unit** — tree assembly, NFC/BOM/CRLF normalisation, change detection, `deaccent` across full Latin-1 and Latin Extended-A
2. **Integration** — against real CouchDB + Clouseau in Docker via testcontainers: push, read back, run a view query and a `_search` query, verify the bundle actually executes in SpiderMonkey
3. **Golden** — planning the same tree twice produces no changes (idempotency)

## Configuration

`couchman.config.js` (ESM, loaded via `import()`) uses `defineConfig` for environments and database allowlist. Credentials come from `COUCHMAN_USER`/`COUCHMAN_PASSWORD` env vars or the URL — never from the config file. The config is schema-validated at startup.

## Versioned search index deployment (blue/green)

```bash
couchman push --as=search_v2
couchman warm --ddoc=search_v2
couchman promote search_v2 search   # flips alias in couchman:aliases doc
couchman push --prune               # later: remove old version
```
