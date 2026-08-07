import { createLogger } from "./logger.js";
import { CouchmanError, EXIT } from "./errors.js";

/**
 * @typedef {object} Context
 * @property {Record<string, any>} opts  Merged command + global options.
 * @property {import("./logger.js").Logger} logger
 * @property {string} cwd
 */

/**
 * Wrap a command handler so every command shares the same setup and error
 * handling: build the context (global options + logger), run the handler, and
 * translate the outcome into a process exit code.
 *
 * A handler may return a number to set the exit code explicitly (e.g. `plan`
 * returns EXIT.CHANGES when a diff is pending). A thrown CouchmanError is
 * printed without a stack; anything else is treated as a bug and printed with
 * its stack.
 *
 * @param {(ctx: Context, command: import("commander").Command) => unknown} handler
 */
export function makeAction(handler) {
  return async (/** @type {any[]} */ ...args) => {
    // Commander calls the action with (…positionals, options, command).
    const command = args.at(-1);
    const opts = command.optsWithGlobals();
    const logger = createLogger({ json: opts.json, verbose: opts.verbose });
    const ctx = { opts, logger, cwd: process.cwd() };

    try {
      const result = await handler(ctx, command);
      if (typeof result === "number") process.exitCode = result;
    } catch (err) {
      if (err instanceof CouchmanError) {
        logger.error(err.message);
        process.exitCode = err.exitCode;
      } else {
        logger.error(err?.stack ?? String(err));
        process.exitCode = EXIT.ERROR;
      }
    }
  };
}
