import { makeAction } from "../action.js";
import { EXIT, CouchmanError } from "../errors.js";
import { findDatabasesDir } from "../project.js";
import { loadConfig, resolveEnvironment } from "../config/load.js";
import { buildAll } from "../build/build.js";
import { createClient } from "../couch/client.js";
import { fetchCurrent } from "../couch/fetch.js";
import { buildPlan, planHasChanges } from "../plan/plan.js";
import { formatPlan } from "../plan/format.js";

/**
 * `couchman plan` — diff the tree against the database; writes nothing.
 * Exit 2 when changes are pending (useful in CI), 0 when up to date.
 */
export const plan = makeAction(async (ctx) => {
  const { logger, opts } = ctx;

  const databasesDir = await findDatabasesDir(ctx.cwd);
  const { config } = await loadConfig(ctx.cwd);
  const env = resolveEnvironment(config, opts.env);

  // Build the desired design documents from the tree (bundled to ES5).
  const { results } = await buildAll(databasesDir, {
    strict: opts.strict,
    wrap: config.wrap,
    target: config.target,
  });
  const failed = results.filter((r) => r.error);
  if (failed.length) {
    for (const r of failed) logger.error(`${r.db}/${r.ddoc}: ${r.error}`);
    throw new CouchmanError("build failed; fix the errors above before planning");
  }

  let desired = results.map((r) => ({ db: r.db, ddoc: r.ddoc, doc: r.doc }));
  desired = desired.filter((d) => config.databases.includes(d.db));
  if (opts.db) desired = desired.filter((d) => d.db === opts.db);
  if (opts.ddoc) desired = desired.filter((d) => d.ddoc === opts.ddoc);

  const dbs = opts.db ? [opts.db] : config.databases;
  const client = createClient(env);
  const current = await fetchCurrent(client, dbs, opts.ddoc);

  const result = buildPlan({ desired, current });

  if (opts.json) {
    logger.result(result);
  } else {
    logger.out(formatPlan(result, { verbose: opts.verbose }));
  }
  for (const d of result.ddocs) {
    if (d.warning) logger.warn(d.warning);
  }

  return planHasChanges(result) ? EXIT.CHANGES : EXIT.OK;
});
