import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeAction } from "../action.js";
import { CouchmanError } from "../errors.js";
import { loadConfig, resolveEnvironment } from "../config/load.js";
import { createClient } from "../couch/client.js";
import { decomposeDdoc } from "../pull/decompose.js";

/**
 * `couchman pull --db <db> [--out <dir>]` — adopt an existing database into a
 * tree (one-way). Writes every `_design/*` document as files under `--out`
 * (default `couch/databases/<db>`).
 */
export const pull = makeAction(async (ctx) => {
  const { logger, opts } = ctx;
  const db = opts.db;

  const { config } = await loadConfig(ctx.cwd);
  const env = resolveEnvironment(config, opts.env);
  const client = createClient(env);

  const outDir = opts.out
    ? path.resolve(ctx.cwd, opts.out)
    : path.join(ctx.cwd, "couch", "databases", db);

  const docs = await client.listDesignDocs(db);
  if (docs.length === 0) {
    throw new CouchmanError(`no design documents found in "${db}"`);
  }

  let ddocCount = 0;
  let fileCount = 0;
  for (const doc of docs) {
    const ddoc = String(doc._id).replace(/^_design\//, "");
    const files = decomposeDdoc(doc);
    for (const f of files) {
      const full = path.join(outDir, ddoc, f.rel);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, f.content);
    }
    logger.info(`pulled _design/${ddoc} (${files.length} files)`);
    ddocCount++;
    fileCount += files.length;
  }

  if (opts.json) logger.result({ out: outDir, ddocs: ddocCount, files: fileCount });
  else {
    const rel = path.relative(ctx.cwd, outDir);
    const shown = rel && !rel.startsWith("..") ? rel : outDir;
    logger.info(`pulled ${ddocCount} design document(s) into ${shown}`);
  }
});
