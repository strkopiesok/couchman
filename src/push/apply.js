import { CouchmanError } from "../errors.js";

const keyOf = (db, ddoc) => `${db}/${ddoc}`;

/**
 * @typedef {object} Confirm
 * @property {(hasRebuild: boolean) => Promise<boolean>} proceed
 *   Overall y/N approval; `--yes` makes this return true.
 * @property {(message: string, expected: string) => Promise<boolean>} typed
 *   Requires the user to type `expected` exactly; `--yes` does NOT bypass it.
 */

/**
 * Apply a plan to the database. Writes creates and updates (each carrying the
 * couchman marker and the plan's `_rev`); deletes managed documents only when
 * `prune` is set and their name is typed to confirm.
 *
 * Pure with respect to I/O: the database and prompts are injected, so the whole
 * flow is testable without a network or a TTY.
 *
 * @param {object} args
 * @param {ReturnType<typeof import("../plan/plan.js").buildPlan>} args.plan
 * @param {Array<{ db: string, ddoc: string, doc: Record<string, any>, dir?: string }>} args.desired
 * @param {object} args.client
 * @param {{ name: string, protected: boolean }} args.env
 * @param {boolean} args.prune
 * @param {Confirm} args.confirm
 * @param {(ddoc: string, desired: any) => Record<string, any>} args.marker
 * @returns {Promise<{ created: number, updated: number, deleted: number, skipped: number, aborted?: boolean }>}
 */
export async function applyPlan({ plan, desired, client, env, prune, confirm, marker }) {
  const desMap = new Map(desired.map((d) => [keyOf(d.db, d.ddoc), d]));

  const writes = plan.ddocs.filter((d) => d.op === "create" || d.op === "update");
  const deletes = prune ? plan.ddocs.filter((d) => d.op === "delete") : [];

  if (writes.length === 0 && deletes.length === 0) {
    return { created: 0, updated: 0, deleted: 0, skipped: 0 };
  }

  // Approval gate. A protected environment must be confirmed by typing its
  // name — `--yes` alone is not enough.
  const hasRebuild = writes.some((d) => d.viewRebuild || d.indexRebuild);
  if (env.protected) {
    const ok = await confirm.typed(
      `environment "${env.name}" is protected — type its name to continue`,
      env.name,
    );
    if (!ok) return { created: 0, updated: 0, deleted: 0, skipped: 0, aborted: true };
  } else {
    const ok = await confirm.proceed(hasRebuild);
    if (!ok) return { created: 0, updated: 0, deleted: 0, skipped: 0, aborted: true };
  }

  let created = 0;
  let updated = 0;
  for (const d of writes) {
    const des = desMap.get(keyOf(d.db, d.ddoc));
    if (!des) throw new CouchmanError(`internal: no source for ${d.db}/${d.ddoc}`);
    const doc = {
      ...des.doc,
      _id: `_design/${d.ddoc}`,
      couchman: marker(d.ddoc, des),
    };
    if (d.op === "update") doc._rev = d.rev; // conflict if it changed meanwhile
    await client.putDesignDoc(d.db, doc);
    if (d.op === "create") created++;
    else updated++;
  }

  // Deletes require typing each document's name, even with --yes.
  let deleted = 0;
  let skipped = 0;
  for (const d of deletes) {
    const ok = await confirm.typed(
      `delete managed "${d.ddoc}" in "${d.db}" — type its name to confirm`,
      d.ddoc,
    );
    if (!ok) {
      skipped++;
      continue;
    }
    await client.deleteDesignDoc(d.db, `_design/${d.ddoc}`, d.rev);
    deleted++;
  }

  return { created, updated, deleted, skipped };
}
