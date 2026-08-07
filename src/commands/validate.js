import { makeAction } from "../action.js";
import { EXIT } from "../errors.js";
import { findDatabasesDir } from "../project.js";
import { buildAll } from "../build/build.js";

/**
 * `couchman validate` — offline: assemble every design document and bundle each
 * function to ES5. Catches parse errors, forbidden imports, cycles and syntax
 * the query server can't run — without touching a database. Run it in CI.
 */
export const validate = makeAction(async (ctx) => {
  const { logger, opts } = ctx;
  const databasesDir = await findDatabasesDir(ctx.cwd);

  const { warnings, results } = await buildAll(databasesDir, {
    strict: opts.strict,
    continueOnError: opts.continueOnError,
  });

  for (const w of warnings) logger.warn(w);

  let ok = 0;
  let errors = 0;
  for (const r of results) {
    for (const w of r.warnings) logger.warn(`${r.db}/${r.ddoc}: ${w}`);
    if (r.error) {
      errors++;
      logger.error(`${r.db}/${r.ddoc}: ${r.error}`);
    } else {
      ok++;
      logger.debug(`ok  ${r.db}/${r.ddoc}`);
    }
  }

  if (opts.json) {
    logger.result({ ok, errors, warnings: warnings.length });
  } else {
    logger.info(
      `${ok} valid, ${errors} error${errors === 1 ? "" : "s"}` +
        (warnings.length ? `, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""),
    );
  }

  return errors > 0 ? EXIT.ERROR : EXIT.OK;
});
