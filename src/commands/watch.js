import { watch as fsWatch } from "node:fs";
import { makeAction } from "../action.js";
import { CouchmanError } from "../errors.js";
import { findDatabasesDir } from "../project.js";
import { loadConfig, resolveEnvironment } from "../config/load.js";
import { runPush } from "../push/run.js";
import { debounce } from "../watch/debounce.js";

/** Auto-confirm: watch is a local dev loop, so it never prompts. */
const AUTO_CONFIRM = {
  proceed: async () => true,
  typed: async () => true,
};

/**
 * `couchman watch` — push on change, debounced by 300 ms. Refuses protected
 * environments, since it would otherwise apply without the typed confirmation.
 */
export const watch = makeAction(async (ctx) => {
  const { logger } = ctx;

  // Guard: never auto-push to a protected environment.
  const { config } = await loadConfig(ctx.cwd);
  const env = resolveEnvironment(config, ctx.opts.env);
  if (env.protected) {
    throw new CouchmanError(`watch refuses the protected environment "${env.name}"`);
  }

  const databasesDir = await findDatabasesDir(ctx.cwd);

  let running = false;
  let queued = false;
  const cycle = async () => {
    // Coalesce overlapping runs: never push twice at once; run once more if a
    // change arrived mid-push.
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await runPush(ctx, { confirm: AUTO_CONFIRM });
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
    } finally {
      running = false;
      if (queued) {
        queued = false;
        cycle();
      }
    }
  };

  // Register the watcher *before* the first push so changes during a slow cold
  // build are not missed.
  const trigger = debounce(cycle, 300);
  const watcher = fsWatch(databasesDir, { recursive: true }, () => trigger());

  logger.info(`watching ${databasesDir} for changes… (Ctrl-C to stop)`);
  await cycle(); // push once up front

  // Keep the process alive; the watcher drives further pushes.
  await new Promise((resolve) => {
    process.once("SIGINT", () => {
      watcher.close();
      trigger.cancel();
      resolve();
    });
  });
});
