import { makeAction } from "../action.js";
import { CouchmanError } from "../errors.js";
import { loadDesiredStructure } from "../prepare.js";
import { createClient } from "../couch/client.js";
import { viewTargets, searchTargets } from "../couch/targets.js";
import { warmAll } from "../couch/warm.js";

/**
 * `couchman warm [--views] [--indexes]` — build views and search indexes so the
 * first user does not pay for the build. With neither flag, warms both.
 */
export const warm = makeAction(async (ctx) => {
  const { logger, opts } = ctx;
  const { env, desired } = await loadDesiredStructure(ctx);

  const wantViews = opts.views || !opts.indexes;
  const wantIndexes = opts.indexes || !opts.views;
  const vts = wantViews ? viewTargets(desired) : [];
  const sts = wantIndexes ? searchTargets(desired) : [];

  const client = createClient(env);
  if (sts.length && !(await client.searchReachable())) {
    throw new CouchmanError(
      "Clouseau is not reachable; cannot warm search indexes",
    );
  }

  logger.info(`warming ${vts.length} view(s), ${sts.length} index(es)…`);
  const res = await warmAll(client, { viewTargets: vts, searchTargets: sts });

  if (opts.json) logger.result(res);
  else logger.info(`warmed ${res.views} view(s), ${res.indexes} index(es)`);
});
