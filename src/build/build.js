import { listDdocs } from "../tree/load.js";
import { assembleDdoc } from "../tree/assemble.js";
import { bundleFunction } from "../bundle/bundle.js";
import { treeRootOf } from "../project.js";
import { CouchmanError } from "../errors.js";

/**
 * @typedef {object} BuildResult
 * @property {string} db
 * @property {string} ddoc
 * @property {string} dir
 * @property {string[]} warnings
 * @property {Record<string, any>} [doc]   Assembled design document (on success).
 * @property {string} [error]              Error message (on failure).
 */

/**
 * Assemble and bundle every design document under `databasesDir`, transpiling
 * each function to ES5. This is the offline heart of `validate` and the input
 * to `plan`/`push`.
 *
 * Expected (CouchmanError) build failures are captured per design document so
 * the caller can report them all; with `continueOnError` false, building stops
 * at the first failure.
 *
 * @param {string} databasesDir
 * @param {{ strict?: boolean, continueOnError?: boolean, wrap?: "iife"|"inline", target?: string }} [opts]
 * @returns {Promise<{ treeRoot: string, warnings: string[], results: BuildResult[] }>}
 */
export async function buildAll(databasesDir, opts = {}) {
  const {
    strict = false,
    continueOnError = false,
    wrap = "iife",
    target = "es5",
  } = opts;

  const treeRoot = treeRootOf(databasesDir);
  const { ddocs, warnings } = await listDdocs(databasesDir, { strict });

  /** @type {BuildResult[]} */
  const results = [];
  for (const { db, ddoc, dir } of ddocs) {
    const bundleWarnings = [];
    const buildFn = (/** @type {string} */ file) =>
      bundleFunction({
        entryFile: file,
        treeRoot,
        wrap,
        target,
        onWarn: (m) => bundleWarnings.push(m),
      });
    try {
      const { doc, warnings: w } = await assembleDdoc(dir, ddoc, {
        strict,
        buildFn,
      });
      results.push({ db, ddoc, dir, doc, warnings: [...w, ...bundleWarnings] });
    } catch (err) {
      if (!(err instanceof CouchmanError)) throw err;
      results.push({ db, ddoc, dir, warnings: [], error: err.message });
      if (!continueOnError) break;
    }
  }

  return { treeRoot, warnings, results };
}
