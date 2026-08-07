import { makeAction } from "../action.js";
import { CouchmanError } from "../errors.js";
import { loadConfig, resolveEnvironment } from "../config/load.js";
import { createClient } from "../couch/client.js";
import { ALIAS_ID, setAlias } from "../push/alias.js";

/**
 * `couchman promote <from> <to>` — point the alias `<to>` at design document
 * `<from>` by updating the `couchman:aliases` document inside the database. The
 * application resolves the current name at runtime, so no redeploy is needed to
 * switch.
 */
export const promote = makeAction(async (ctx, command) => {
  const { logger, opts } = ctx;
  const [from, to] = command.processedArgs;

  const { config } = await loadConfig(ctx.cwd);
  const env = resolveEnvironment(config, opts.env);
  const db =
    opts.db ?? (config.databases.length === 1 ? config.databases[0] : null);
  if (!db) {
    throw new CouchmanError(
      `--db is required (databases: ${config.databases.join(", ")})`,
    );
  }

  const client = createClient(env);

  // Refuse to point an alias at a design document that does not exist.
  if (!(await client.getDocument(db, `_design/${from}`))) {
    throw new CouchmanError(
      `cannot promote: _design/${from} does not exist in "${db}"`,
    );
  }

  const existing = await client.getDocument(db, ALIAS_ID);
  const { doc, prev } = setAlias(existing, from, to);
  await client.putDocument(db, doc);

  logger.info(
    `promoted "${to}" → "${from}"${prev ? ` (was "${prev}")` : ""} in "${db}"`,
  );
  if (opts.json) logger.result({ db, alias: to, target: from, previous: prev });
});
