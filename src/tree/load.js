import { readdir } from "node:fs/promises";
import path from "node:path";
import { CouchmanError } from "../errors.js";
import { nfc, isIgnored, checkName } from "./names.js";
import { assembleDdoc } from "./assemble.js";

/**
 * @typedef {object} DdocRef
 * @property {string} db     Database name (NFC).
 * @property {string} ddoc   Design-document name (NFC).
 * @property {string} dir    Absolute path to the design-document directory.
 */

/**
 * Enumerate the design-document directories under a `databases/` directory
 * without assembling them. `_lib` (shared code) is skipped; the bundler
 * consumes it separately.
 *
 * @param {string} databasesDir  Absolute path to the `databases/` directory.
 * @param {{ strict?: boolean }} [opts]
 * @returns {Promise<{ ddocs: DdocRef[], warnings: string[] }>}
 */
export async function listDdocs(databasesDir, { strict = false } = {}) {
  const warnings = [];
  const note = (/** @type {string} */ msg) => {
    if (strict) throw new CouchmanError(msg);
    warnings.push(msg);
  };

  /** @type {DdocRef[]} */
  const ddocs = [];
  for (const dbEntry of await readdir(databasesDir, { withFileTypes: true })) {
    const db = nfc(dbEntry.name);
    if (isIgnored(db)) continue;
    if (!dbEntry.isDirectory()) {
      throw new CouchmanError(`databases/${db} must be a directory`);
    }
    checkName(db, "database", note);

    const dbDir = path.join(databasesDir, db);
    for (const ddocEntry of await readdir(dbDir, { withFileTypes: true })) {
      const ddoc = nfc(ddocEntry.name);
      if (isIgnored(ddoc)) continue; // also skips _lib
      if (!ddocEntry.isDirectory()) {
        throw new CouchmanError(`databases/${db}/${ddoc} must be a directory`);
      }
      ddocs.push({ db, ddoc, dir: path.join(dbDir, ddoc) });
    }
  }

  return { ddocs, warnings };
}

/**
 * @typedef {DdocRef & { doc: Record<string, any>, warnings: string[] }} LoadedDdoc
 */

/**
 * Walk a `databases/` directory and assemble every design document under it.
 * Function bodies come from `buildFn` (raw text by default; bundled ES5 when a
 * builder is passed).
 *
 * @param {string} databasesDir
 * @param {{ strict?: boolean, buildFn?: (file: string) => Promise<string> }} [opts]
 * @returns {Promise<{ ddocs: LoadedDdoc[], warnings: string[] }>}
 */
export async function loadDatabases(databasesDir, { strict = false, buildFn } = {}) {
  const { ddocs: refs, warnings } = await listDdocs(databasesDir, { strict });
  /** @type {LoadedDdoc[]} */
  const ddocs = [];
  for (const { db, ddoc, dir } of refs) {
    const { doc, warnings: w } = await assembleDdoc(dir, ddoc, { strict, buildFn });
    ddocs.push({ db, ddoc, dir, doc, warnings: w });
  }
  return { ddocs, warnings };
}
