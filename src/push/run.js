import { CouchmanError } from "../errors.js";
import { findDatabasesDir } from "../project.js";
import { loadConfig, resolveEnvironment } from "../config/load.js";
import { buildAll } from "../build/build.js";
import { createClient } from "../couch/client.js";
import { fetchCurrent } from "../couch/fetch.js";
import { buildPlan } from "../plan/plan.js";
import { formatPlan } from "../plan/format.js";
import { applyPlan } from "./apply.js";
import { makeMarker } from "./marker.js";
import { renameForAlias } from "./alias.js";
import { hasSearchIndexes } from "../couch/targets.js";

/**
 * The shared build → plan → apply pipeline behind both `push` and `watch`. The
 * confirmation strategy is injected so `push` can prompt interactively while
 * `watch` auto-confirms.
 *
 * @param {import("../action.js").Context} ctx
 * @param {{ confirm: import("./apply.js").Confirm }} args
 * @returns {Promise<{ plan: any, result: any }>}
 */
export async function runPush(ctx, { confirm }) {
  const { logger, opts } = ctx;

  const databasesDir = await findDatabasesDir(ctx.cwd);
  const { config } = await loadConfig(ctx.cwd);
  const env = resolveEnvironment(config, opts.env);

  const { results } = await buildAll(databasesDir, {
    strict: opts.strict,
    wrap: config.wrap,
    target: config.target,
  });
  const failed = results.filter((r) => r.error);
  if (failed.length) {
    for (const r of failed) logger.error(`${r.db}/${r.ddoc}: ${r.error}`);
    throw new CouchmanError("build failed; fix the errors above before pushing");
  }

  let desired = results
    .filter((r) => config.databases.includes(r.db))
    .map((r) => ({ db: r.db, ddoc: r.ddoc, doc: r.doc, dir: r.dir }));
  if (opts.db) desired = desired.filter((d) => d.db === opts.db);
  if (opts.ddoc) desired = desired.filter((d) => d.ddoc === opts.ddoc);
  if (opts.as) desired = renameForAlias(desired, opts.as);

  const dbs = opts.db ? [opts.db] : config.databases;
  const client = createClient(env);

  const existing = [];
  const missing = [];
  for (const db of dbs) {
    if (await client.databaseExists(db)) existing.push(db);
    else missing.push(db);
  }
  if (missing.length) {
    if (opts.createDb) {
      for (const db of missing) {
        logger.info(`creating database "${db}"`);
        await client.createDatabase(db);
        existing.push(db);
      }
    } else if (desired.some((d) => missing.includes(d.db))) {
      throw new CouchmanError(
        `database(s) do not exist: ${missing.join(", ")} (pass --create-db to create)`,
      );
    }
  }

  // `--as` scopes both desired and current to the alias, so a sibling design
  // document is never seen as stale.
  const ddocFilter = opts.as ?? opts.ddoc;
  const current = await fetchCurrent(client, existing, ddocFilter);
  const plan = buildPlan({ desired, current });

  if (!opts.json) logger.out(formatPlan(plan, { verbose: opts.verbose }));
  for (const d of plan.ddocs) if (d.warning) logger.warn(d.warning);

  const pending =
    plan.summary.create + plan.summary.update + (opts.prune ? plan.summary.delete : 0);
  if (pending === 0) {
    logger.info(
      plan.summary.delete && !opts.prune
        ? "up to date (managed deletions pending; pass --prune to apply)"
        : "up to date, nothing to push",
    );
    const result = { created: 0, updated: 0, deleted: 0, skipped: 0 };
    if (opts.json) logger.result({ plan, result });
    return { plan, result };
  }

  if (hasSearchIndexes(desired) && plan.summary.create + plan.summary.update > 0) {
    if (!(await client.searchReachable())) {
      throw new CouchmanError(
        "Clouseau is not reachable; refusing to push search indexes " +
          "(start Clouseau, or remove indexes/)",
      );
    }
  }

  const result = await applyPlan({
    plan,
    desired,
    client,
    env,
    prune: opts.prune,
    confirm,
    marker: makeMarker({ cwd: ctx.cwd }),
  });

  if (result.aborted) {
    logger.info("aborted");
  } else {
    logger.info(
      `pushed: +${result.created} ~${result.updated} -${result.deleted}` +
        (result.skipped ? ` (${result.skipped} skipped)` : ""),
    );
  }
  if (opts.json) logger.result({ plan, result });
  return { plan, result };
}
