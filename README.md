# couchman

Manage CouchDB 3 design documents as files in your repository.

Design documents belong in git, not in Fauxton. `couchman` builds them from a directory tree, shows you a plan of what would change, and writes them only after you approve. It handles map/reduce views, filters, updates, shows, lists, `validate_doc_update`, and **Clouseau search indexes**.

```
$ couchman plan --env=staging

register/_design/search
  ~ views/by_case_children/map.js       rebuild view
  ~ indexes/entities/index.js           FULL INDEX REBUILD
  + filters/published.js

1 database, +1 ~2 -0, 1 warning
```

---

## Why

Most CouchDB projects end up with a homegrown script that walks a folder, concatenates some JavaScript, and PUTs design documents. Those scripts tend to share the same set of problems: they delete anything they don't recognise, they mangle non-ASCII filenames differently on macOS and Linux, they inline shared code with regular expressions, and they emit modern JavaScript into a query server that cannot run it.

`couchman` is that script done properly.

## What it does

- Builds design documents from a directory tree.
- Diffs them against the database and prints a plan.
- Applies the plan (insert / update / delete) after confirmation.
- Warms views and search indexes so the first user doesn't pay for the build.
- Pulls an existing database's design documents into a tree, so you can adopt a project you didn't start.
- Pushes seed documents as fixtures.

## What it does not do

Data migrations, document transformations, replication, or cluster administration. Those are different tools.

---

## Install

```bash
npm install --save-dev couchman
npx couchman plan
```

Or run without installing:

```bash
npx couchman@latest plan
```

Installing from git works too, if you need an unreleased commit:

```bash
npm install --save-dev github:owner/couchman#main
```

Requires **Node.js 22 LTS** or newer.

## Quick start

```bash
npx couchman new view mydb/main/by_type
npx couchman validate          # offline check, no database needed
npx couchman plan --env=local
npx couchman push --env=local
```

---

## File layout

```
couch/
  couchman.config.js               environments, database allowlist
  databases/
    mydb/                          database name
      main/                        → _design/main
        meta.json                  language, options, autoupdate
        views/
          by_type/
            map.js
            reduce.js              or in meta.json: { "reduce": "_count" }
        indexes/                   → Clouseau search indexes
          entities/
            index.js
            meta.json              { "analyzer": ..., "default_analyzer": ... }
        filters/
          published.js             one file, one function
        updates/
          touch.js
        validate_doc_update.js
      _lib/                        shared code, this database only
        helpers.js
  shared/                          shared code, all databases
    normalize.js
  fixtures/
    mydb/
      seed.json
```

### Rules

- **A directory is a map of functions** — `views`, `indexes`, `filters`, `updates`, `shows`, `lists`.
- **A file at the design-document root is a scalar field** — `validate_doc_update.js`, `rewrites.json`.
- `meta.json` is the only place for non-script fields: `language`, `options.partitioned`, `autoupdate`, builtin reduces, analyzers. Without it you cannot express half of what a design document supports.
- An unknown directory or extension is an **error**, not a silent skip. Silently ignoring input is the worst possible default in a tool that writes to a production database.
- Files and directories starting with `.` or `_` are ignored, except `_lib`.

---

## Shared code

Instead of textual include directives, `couchman` uses real imports and bundles them with [esbuild](https://esbuild.github.io/):

```js
// databases/mydb/main/indexes/entities/index.js
import { deaccent } from "../../../../../shared/normalize.js";

export default function (doc) {
  if (doc.type !== "article") return;
  index("title", doc.title, { store: true });
  index("title_norm", deaccent(doc.title));
}
```

- Imports must resolve inside `_lib/` or `shared/`. There is no `node_modules` in a query server, so an import that reaches outside the tree is an error at build time.
- The bundle is emitted as a single self-contained expression that evaluates to a function. The default wrapper is `(function () { /* helpers */ return function (doc) { … }; })()`. If your CouchDB build rejects that form, `--wrap=inline` places the helpers inside the function body instead. Both forms are covered by integration tests that actually execute them in a query server.
- Errors point at your source file with a source map, not at a generated temporary file.

### ES5 output

CouchDB's JavaScript query server runs on SpiderMonkey, and depending on the build it may not support arrow functions, `let`/`const`, template literals, or `String.prototype.normalize`.

**`couchman` transpiles everything to ES5 by default.** You write modern JavaScript; the query server gets something it can run. This is not configurable downward — if you need a higher target for a specific build, set `target` in `couchman.config.js` and own the consequences.

---

## Encoding and diacritics

Three separate problems, all of them quiet until they aren't.

### 1. Filenames

macOS returns filenames in NFD, Linux in NFC. The same repository therefore produces **different view names** on a developer's machine and in CI, and a deploy from CI silently deletes and recreates the index.

`couchman` normalises every path segment to **NFC** before using it as a design document, view, or index name. Names outside `[a-z0-9_]` produce a warning, or an error under `--strict`. Diacritics belong in your data, not in your view names.

### 2. File contents

Files are read explicitly as UTF-8, the BOM is stripped, and CRLF is normalised to LF before comparison. Without this, a single commit from a Windows machine rewrites every design document and the plan shows a hundred changes where there are none.

### 3. Diacritics in your data

`shared/normalize.js` ships with the tool and is meant to be used, not just read:

- `deaccent(s)` — folds Latin-1 and Latin Extended-A characters to ASCII using a lookup table. **Not** `normalize("NFD")`, which may not exist in the query server.
- `fold(s)` — `deaccent` plus lowercasing and whitespace collapsing.
- `tokenize(s)` — splits text into tokens for Lucene indexing.

Language-specific stemming is deliberately out of scope. Put it in your own `shared/` module; `couchman` will bundle it the same way.

---

## CLI

```
couchman plan      [--env] [--db] [--ddoc]      diff only, writes nothing
couchman push      [--env] [--yes] [--prune]    apply the plan
couchman pull      --db [--out]                 adopt an existing database
couchman validate                               offline: parse, bundle, target check
couchman warm      [--views] [--indexes] [--db] build views and indexes
couchman info      [--db]                       index sizes, build status
couchman watch     [--env=local]                push on change (300 ms debounce)
couchman promote   <from> <to> [--db]           switch a design document alias
couchman fixtures  push [--db]                  seed documents
couchman new       view|index <db>/<ddoc>/<name>
```

Global flags: `--env`, `--json`, `--verbose`, `--strict`, `--continue-on-error`.

- `plan` is a separate command, and `push` always runs it and shows the result before writing. This is the Terraform model, not "press y within 60 seconds".
- `validate` needs no database. Run it in CI on every pull request.
- Exit codes: `0` no changes, `2` changes pending (useful for `plan` in CI), `1` error.

---

## Configuration

Environments live in `couchman.config.js`; credentials live in the environment.

```ts
import { defineConfig } from "couchman";

export default defineConfig({
  environments: {
    local:   { url: "http://127.0.0.1:5984" },
    staging: { url: process.env.COUCHMAN_URL },
    prod:    { url: process.env.COUCHMAN_URL, protected: true },
  },
  databases: ["mydb"],
  target: "es5",
});
```

Credentials come from `COUCHMAN_USER` and `COUCHMAN_PASSWORD`, or from the URL. The config file is validated with a schema at startup and fails fast. Never commit credentials; `.env` belongs in `.gitignore`.

Named environments replace the older convention of prefixing database names (`dev_mydb`) to separate development from production.

---

## Change detection and the plan

Comparison runs on a **normalised** design document — `_rev` and volatile metadata removed — so unchanged trees produce empty plans.

The plan distinguishes how expensive a change is:

| Change | Cost |
| --- | --- |
| `~ view map` or `~ reduce` | view rebuild, usually survivable |
| `~ index function` or `~ analyzer` | **full Lucene index rebuild**, can take hours |
| `~ meta` with no index impact | free |

Changes that trigger a rebuild are flagged in the plan, and `push` asks for a second confirmation before applying them.

Diffs are shown unified, line by line within each function — not as two JSON blobs side by side.

---

## Write safety

- **`couchman` only manages design documents it created.** It writes a marker into each one:

  ```json
  "couchman": { "managed": true, "source": "databases/mydb/main", "pushed_at": "…", "git_sha": "…" }
  ```

  Unmanaged design documents appear in the plan as *ignored* and are never deleted. A tool that deletes everything it doesn't recognise will eventually delete something it should not have.

- Deleting managed design documents requires `--prune` and confirmation by name.
- Every write carries the `_rev` from the plan. If it changed in the meantime that is a **conflict and an error**, not a retry with a fresh revision.
- An environment marked `protected: true` requires confirmation by typing the environment name. `--yes` alone is not enough.
- Creating a database is an explicit operation (`--create-db`), never a side effect of `push`.

---

## Clouseau and search indexes

`couchman` checks that Clouseau is reachable before pushing search indexes. If it isn't, the push fails — rather than writing a design document that only fails later, at the first query.

- `warm --indexes` issues `q=*:*&limit=0` against each index and waits for a response.
- `info` reports index size and whether a build is in progress.
- Analyzers are written from `meta.json`, so they can't be forgotten and silently fall back to the default.

### Versioned deployment

Changing an index function rebuilds the index from scratch. Without a strategy for that, every deploy means downtime for search. `couchman` supports a blue/green flow:

```bash
couchman push --as=search_v2      # deploy the tree under a new name
couchman warm --ddoc=search_v2    # wait for the build to finish
couchman promote search_v2 search # flip the alias
couchman push --prune             # later: remove the old version
```

The alias lives in a document **inside the database** (`couchman:aliases`), so your application resolves the current design document name at runtime and no redeploy is needed to switch:

```json
{ "_id": "couchman:aliases", "search": "search_v2" }
```

---

## Fixtures

Seed documents are plain JSON files, upserted by `_id`:

- A fixture never overwrites a document that a human has edited. `couchman` stores a hash of the last pushed version and compares against it; a mismatch is reported and left alone rather than resolved automatically.
- Fixtures are for bootstrap data — reference records, configuration documents, feed definitions. They are not a migration system.
- Never put secrets or password hashes in fixtures. Credentials belong in documents created out of band.

---

## Output

Progress output is terse. At the end you get one summary: database, `+insert ~update -delete`, warnings.

Warnings and errors go to stderr, data goes to stdout, so output can be piped. `--json` gives machine-readable output for every command. `--verbose` adds detail; by default the tool stays quiet about things that didn't change.

---

## Migrating from a homegrown script

If you're replacing a `cm.js`-style script, here's what changes and why.

| Old approach | `couchman` |
| --- | --- |
| `cradle` client | `nano` — `cradle` has been unmaintained since 2016 |
| Interactive "press y", raw stdin mode, AFK timeout | `plan` and `push --yes` |
| `esprima` + `escodegen`, broken output dumped to a temp file | esbuild, with real error messages and source maps |
| `//INCLUDE:file:DONE` textual substitution | ES module imports, cycle-checked and bundled |
| `config.local.json` | environment variables and named environments |
| `dev_` database name prefix | named environments |
| Deleting every design document not found in the tree | `managed` marker plus explicit `--prune` |
| Hardcoded exceptions for specific database or document names | configuration, or nothing at all |
| `try/catch` that logs and continues | errors stop the run unless `--continue-on-error` |
| No support for `options`, builtin reduces, or analyzers | `meta.json` |

`pull` exists to help with this: point it at an existing database and it writes the design documents into a tree you can commit.

```bash
couchman pull --db=mydb --out=couch/databases/mydb
```

`pull` is a **one-way adoption tool**, not a round-trip. It reformats what it finds, so pushing a freshly pulled tree may show cosmetic differences on the first run. Review the output, commit it, and treat the tree as the source of truth from then on.

Legacy `//INCLUDE:` directives are still recognised, with a deprecation warning, so a large tree can be migrated file by file.

---

## Testing

Contributions should keep three layers green:

- **Unit** — tree to design document assembly, NFC/BOM/CRLF normalisation, change detection, `deaccent` across the full Latin-1 and Latin Extended-A range.
- **Integration** — against CouchDB **with Clouseau** in Docker (testcontainers): push, read the design document back, run both a view and a `_search` query, and verify the bundled function actually executes in the query server. This is the only test that catches SpiderMonkey incompatibility.
- **Golden** — the same tree planned twice in a row produces no changes.

```bash
npm test                                            # unit + golden
npm run test:integration                            # spins up CouchDB+Clouseau via testcontainers (needs Docker)
COUCHMAN_IT_URL=http://admin:pass@host:5984 \
  npm run test:integration                          # …or point at an existing CouchDB
```

## Roadmap

- Partitioned database support beyond `options.partitioned`.
- Optional Nouveau support alongside Clouseau, once it stabilises.
- A `doctor` command that reports stale indexes and unmanaged design documents across a cluster.

## License

MIT
