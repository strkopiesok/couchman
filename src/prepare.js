import { findDatabasesDir } from "./project.js";
import { loadConfig, resolveEnvironment } from "./config/load.js";
import { loadDatabases } from "./tree/load.js";

/**
 * Shared setup for commands that need the tree structure and a resolved
 * environment but not bundled function bodies (warm, info). Uses the raw tree
 * (no bundling) since only the view/index names are needed.
 *
 * @param {import("./action.js").Context} ctx
 * @returns {Promise<{ config: any, env: any, desired: Array<{db,ddoc,doc}>, databasesDir: string }>}
 */
export async function loadDesiredStructure(ctx) {
  const databasesDir = await findDatabasesDir(ctx.cwd);
  const { config } = await loadConfig(ctx.cwd);
  const env = resolveEnvironment(config, ctx.opts.env);

  const { ddocs } = await loadDatabases(databasesDir);
  let desired = ddocs
    .filter((d) => config.databases.includes(d.db))
    .map((d) => ({ db: d.db, ddoc: d.ddoc, doc: d.doc }));
  if (ctx.opts.db) desired = desired.filter((d) => d.db === ctx.opts.db);
  if (ctx.opts.ddoc) desired = desired.filter((d) => d.ddoc === ctx.opts.ddoc);

  return { config, env, desired, databasesDir };
}
