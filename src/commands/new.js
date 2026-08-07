import path from "node:path";
import { makeAction } from "../action.js";
import { databasesDirOrDefault } from "../project.js";
import { scaffold } from "../build/scaffold.js";
import { isValidName } from "../tree/names.js";

/**
 * `couchman new view|index <db>/<ddoc>/<name>` — scaffold a new artifact.
 */
export const newCmd = makeAction(async (ctx, command) => {
  const { logger } = ctx;
  const [kind, spec] = command.processedArgs;

  const databasesDir = await databasesDirOrDefault(ctx.cwd);
  const { dir, files } = await scaffold(databasesDir, kind, spec);

  for (const part of String(spec).split("/")) {
    if (!isValidName(part)) {
      logger.warn(`name "${part}" contains characters outside [a-z0-9_]`);
    }
  }

  for (const f of files) {
    logger.info(`created ${path.relative(ctx.cwd, f)}`);
  }
  if (logger.json) logger.result({ dir, files });
});
