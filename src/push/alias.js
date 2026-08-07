import { CouchmanError } from "../errors.js";

/** The document, inside the database, that maps alias names to design docs. */
export const ALIAS_ID = "couchman:aliases";

/**
 * Set `aliases[to] = from` on the aliases document, preserving `_rev` and any
 * other aliases. Returns the new document and the previous target (if any).
 *
 * The application resolves the current design-document name at runtime from
 * this document, so flipping an alias needs no redeploy.
 *
 * @param {Record<string, any>|null} existing
 * @param {string} from  The design-document name to point at.
 * @param {string} to    The alias name the application reads.
 * @returns {{ doc: Record<string, any>, prev: string|undefined }}
 */
export function setAlias(existing, from, to) {
  const doc = existing ? { ...existing } : { _id: ALIAS_ID };
  const prev = doc[to];
  doc[to] = from;
  return { doc, prev };
}

/**
 * Rewrite the desired design documents so a single one is pushed under an
 * alternate name (`push --as=<name>`). Requires exactly one target — narrow
 * with `--db`/`--ddoc` when the tree has several.
 *
 * @param {Array<{ db: string, ddoc: string, doc: any, dir?: string }>} desired
 * @param {string} asName
 * @returns {Array<{ db: string, ddoc: string, doc: any, dir?: string }>}
 */
export function renameForAlias(desired, asName) {
  if (desired.length !== 1) {
    throw new CouchmanError(
      `--as requires exactly one design document; narrow with --db/--ddoc ` +
        `(matched ${desired.length})`,
    );
  }
  return [{ ...desired[0], ddoc: asName }];
}
