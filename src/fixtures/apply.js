import { createHash } from "node:crypto";
import { CouchmanError } from "../errors.js";

/** Field couchman writes into a fixture to remember what it last pushed. */
export const FIXTURE_KEY = "couchman:fixture";

/** Stable JSON with sorted keys, so the hash is independent of key order. */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The document body that matters for a fixture: no `_rev`, no fixture marker. */
function body(doc) {
  const out = {};
  for (const k of Object.keys(doc)) {
    if (k !== "_rev" && k !== FIXTURE_KEY) out[k] = doc[k];
  }
  return out;
}

/**
 * @param {Record<string, any>} doc
 * @returns {string}
 */
export function hashOf(doc) {
  return createHash("sha256").update(stable(body(doc))).digest("hex");
}

/**
 * Upsert seed documents by `_id`. A fixture never overwrites a document a human
 * has edited: couchman stores the hash of the version it last pushed and, on the
 * next push, compares it against the document's current content. A mismatch is
 * reported and left alone rather than resolved automatically.
 *
 * @param {{ getDocument: Function, putDocument: Function }} client
 * @param {string} db
 * @param {Array<Record<string, any>>} docs
 * @returns {Promise<{ inserted: number, updated: number, unchanged: number, conflicts: string[] }>}
 */
export async function applyFixtures(client, db, docs) {
  const summary = { inserted: 0, updated: 0, unchanged: 0, conflicts: [] };

  for (const desired of docs) {
    if (!desired || !desired._id) {
      throw new CouchmanError("fixture is missing _id");
    }
    const hash = hashOf(desired);
    const current = await client.getDocument(db, desired._id);

    if (!current) {
      await client.putDocument(db, {
        ...body(desired),
        _id: desired._id,
        [FIXTURE_KEY]: { hash },
      });
      summary.inserted++;
      continue;
    }

    const currentHash = hashOf(current);
    const storedHash = current[FIXTURE_KEY]?.hash;

    if (storedHash !== currentHash) {
      // Edited outside couchman (or never managed) — never overwrite.
      summary.conflicts.push(desired._id);
      continue;
    }
    if (currentHash === hash) {
      summary.unchanged++;
      continue;
    }
    await client.putDocument(db, {
      ...body(desired),
      _id: desired._id,
      _rev: current._rev,
      [FIXTURE_KEY]: { hash },
    });
    summary.updated++;
  }

  return summary;
}
