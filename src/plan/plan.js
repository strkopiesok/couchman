import { diffDdoc } from "./diff.js";
import { isManaged } from "./normalize.js";

/**
 * @typedef {object} DdocPlan
 * @property {string} db
 * @property {string} ddoc
 * @property {"create"|"update"|"delete"|"ignore"|"noop"} op
 * @property {string} [rev]     Current _rev (for update/delete).
 * @property {import("./diff.js").Change[]} changes
 * @property {boolean} [viewRebuild]
 * @property {boolean} [indexRebuild]
 * @property {string} [warning]
 */

const keyOf = (db, ddoc) => `${db}/${ddoc}`;

/**
 * Compare the desired design documents (built from the tree) against the current
 * ones (read from the database) and produce a plan. Pure: it takes already
 * fetched inputs so it can be tested without a database.
 *
 * @param {object} args
 * @param {Array<{ db: string, ddoc: string, doc: Record<string, any> }>} args.desired
 * @param {Array<{ db: string, ddoc: string, doc: Record<string, any> }>} args.current
 * @returns {{ databases: string[], ddocs: DdocPlan[], summary: Record<string, number> }}
 */
export function buildPlan({ desired, current }) {
  const curMap = new Map(current.map((c) => [keyOf(c.db, c.ddoc), c]));
  const seen = new Set();
  /** @type {DdocPlan[]} */
  const ddocs = [];

  for (const d of desired) {
    seen.add(keyOf(d.db, d.ddoc));
    const cur = curMap.get(keyOf(d.db, d.ddoc));

    if (!cur) {
      ddocs.push({
        db: d.db,
        ddoc: d.ddoc,
        op: "create",
        changes: diffDdoc(null, d.doc).changes,
      });
    } else if (!isManaged(cur.doc)) {
      ddocs.push({
        db: d.db,
        ddoc: d.ddoc,
        op: "ignore",
        rev: cur.doc._rev,
        changes: [],
        warning:
          `unmanaged design document "${d.ddoc}" exists in "${d.db}"; ` +
          `couchman will not overwrite it`,
      });
    } else {
      const diff = diffDdoc(cur.doc, d.doc);
      if (diff.changes.length === 0) {
        ddocs.push({ db: d.db, ddoc: d.ddoc, op: "noop", changes: [] });
      } else {
        ddocs.push({
          db: d.db,
          ddoc: d.ddoc,
          op: "update",
          rev: cur.doc._rev,
          changes: diff.changes,
          viewRebuild: diff.viewRebuild,
          indexRebuild: diff.indexRebuild,
        });
      }
    }
  }

  // Design documents present in the database but not in the tree.
  for (const c of current) {
    if (seen.has(keyOf(c.db, c.ddoc))) continue;
    if (isManaged(c.doc)) {
      ddocs.push({
        db: c.db,
        ddoc: c.ddoc,
        op: "delete",
        rev: c.doc._rev,
        changes: [],
      });
    } else {
      ddocs.push({ db: c.db, ddoc: c.ddoc, op: "ignore", rev: c.doc._rev, changes: [] });
    }
  }

  ddocs.sort((a, b) => keyOf(a.db, a.ddoc).localeCompare(keyOf(b.db, b.ddoc)));

  const count = (op) => ddocs.filter((d) => d.op === op).length;
  const summary = {
    create: count("create"),
    update: count("update"),
    delete: count("delete"),
    ignore: count("ignore"),
    warnings: ddocs.filter((d) => d.warning).length,
  };
  const databases = [...new Set(ddocs.map((d) => d.db))].sort();

  return { databases, ddocs, summary };
}

/**
 * @param {ReturnType<typeof buildPlan>} plan
 * @returns {boolean}  True if the plan would write anything.
 */
export function planHasChanges(plan) {
  return plan.summary.create + plan.summary.update + plan.summary.delete > 0;
}
