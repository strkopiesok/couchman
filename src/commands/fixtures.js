import path from "node:path";
import { makeAction } from "../action.js";
import { findDatabasesDir, treeRootOf } from "../project.js";
import { loadConfig, resolveEnvironment } from "../config/load.js";
import { createClient } from "../couch/client.js";
import { loadFixtures } from "../fixtures/load.js";
import { applyFixtures } from "../fixtures/apply.js";

/**
 * `couchman fixtures push` — upsert seed documents by `_id`. Documents edited
 * outside couchman are reported as conflicts and left unchanged.
 */
export const fixturesPush = makeAction(async (ctx) => {
  const { logger, opts } = ctx;

  const databasesDir = await findDatabasesDir(ctx.cwd);
  const fixturesDir = path.join(treeRootOf(databasesDir), "fixtures");
  const { config } = await loadConfig(ctx.cwd);
  const env = resolveEnvironment(config, opts.env);
  const client = createClient(env);

  const dbs = opts.db ? [opts.db] : config.databases;
  const totals = { inserted: 0, updated: 0, unchanged: 0, conflicts: [] };

  for (const db of dbs) {
    const docs = await loadFixtures(fixturesDir, db);
    if (docs.length === 0) continue;
    const s = await applyFixtures(client, db, docs);
    totals.inserted += s.inserted;
    totals.updated += s.updated;
    totals.unchanged += s.unchanged;
    for (const id of s.conflicts) {
      totals.conflicts.push(`${db}/${id}`);
      logger.warn(
        `fixture conflict: ${db}/${id} was edited outside couchman; left unchanged`,
      );
    }
  }

  if (opts.json) {
    logger.result(totals);
  } else {
    logger.info(
      `fixtures: +${totals.inserted} ~${totals.updated} =${totals.unchanged}` +
        (totals.conflicts.length ? `, ${totals.conflicts.length} conflict(s)` : ""),
    );
  }
});
