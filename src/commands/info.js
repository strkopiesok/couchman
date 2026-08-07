import { makeAction } from "../action.js";
import { loadDesiredStructure } from "../prepare.js";
import { createClient } from "../couch/client.js";
import { searchTargets } from "../couch/targets.js";
import { collectInfo, humanBytes } from "../couch/info.js";

/**
 * `couchman info` — report search index sizes and whether a build is in progress.
 */
export const info = makeAction(async (ctx) => {
  const { logger, opts } = ctx;
  const { env, desired } = await loadDesiredStructure(ctx);

  const client = createClient(env);
  const { indexes } = await collectInfo(client, {
    searchTargets: searchTargets(desired),
  });

  if (opts.json) {
    logger.result({ indexes });
    return;
  }
  if (indexes.length === 0) {
    logger.info("no search indexes");
    return;
  }
  for (const i of indexes) {
    if (i.error) {
      logger.out(`${i.db}/${i.ddoc}/${i.index}  error: ${i.error}`);
    } else {
      logger.out(
        `${i.db}/${i.ddoc}/${i.index}  size=${humanBytes(i.diskSize)} ` +
          `docs=${i.docCount ?? "?"}${i.building ? " (building)" : ""}`,
      );
    }
  }
});
