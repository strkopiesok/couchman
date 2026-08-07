import { access } from "node:fs/promises";
import path from "node:path";
import { CouchmanError } from "./errors.js";

/** Directory layouts we recognise, relative to the project root. */
const CANDIDATES = ["couch/databases", "databases"];

/**
 * Locate the `databases/` directory for the project rooted at `cwd`.
 *
 * @param {string} cwd
 * @returns {Promise<string>}  Absolute path to the databases directory.
 */
export async function findDatabasesDir(cwd) {
  for (const rel of CANDIDATES) {
    const p = path.join(cwd, rel);
    try {
      await access(p);
      return p;
    } catch {
      // try next candidate
    }
  }
  throw new CouchmanError(
    "no couch/databases or databases directory found; run from your project root",
  );
}

/**
 * The default databases directory to create when none exists yet (used by
 * `new` to scaffold the first artifact).
 *
 * @param {string} cwd
 * @returns {Promise<string>}
 */
export async function databasesDirOrDefault(cwd) {
  try {
    return await findDatabasesDir(cwd);
  } catch {
    return path.join(cwd, "couch", "databases");
  }
}

/**
 * The tree root (parent of `databases/`, where `shared/` also lives). This is
 * the import boundary passed to the bundler.
 *
 * @param {string} databasesDir
 * @returns {string}
 */
export function treeRootOf(databasesDir) {
  return path.dirname(databasesDir);
}
