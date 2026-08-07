import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { buildAll } from "../src/build/build.js";
import { buildPlan, planHasChanges } from "../src/plan/plan.js";
import { fetchCurrent } from "../src/couch/fetch.js";
import { applyPlan } from "../src/push/apply.js";
import { CouchmanError } from "../src/errors.js";

const treeDatabases = fileURLToPath(
  new URL("./fixtures/tree/databases", import.meta.url),
);

/** In-memory stand-in for the CouchDB client. */
function fakeClient(seed = {}) {
  const dbs = new Map();
  for (const [db, docs] of Object.entries(seed)) {
    dbs.set(db, new Map(docs.map((d) => [d._id, d])));
  }
  let n = 0;
  return {
    _dbs: dbs,
    async databaseExists(db) {
      return dbs.has(db);
    },
    async createDatabase(db) {
      if (!dbs.has(db)) dbs.set(db, new Map());
    },
    async listDesignDocs(db) {
      return [...(dbs.get(db)?.values() ?? [])].map((d) => ({ ...d }));
    },
    async putDesignDoc(db, doc) {
      if (!dbs.has(db)) dbs.set(db, new Map());
      const store = dbs.get(db);
      const existing = store.get(doc._id);
      if (doc._rev && existing && existing._rev !== doc._rev) {
        throw new CouchmanError("conflict");
      }
      const rev = `${++n}-rev`;
      store.set(doc._id, { ...doc, _rev: rev });
      return { ok: true, id: doc._id, rev };
    },
    async deleteDesignDoc(db, id, rev) {
      const store = dbs.get(db);
      const existing = store?.get(id);
      if (existing && existing._rev !== rev) throw new CouchmanError("conflict");
      store?.delete(id);
    },
  };
}

const YES = { proceed: async () => true, typed: async () => true };
const NO_PROCEED = { proceed: async () => false, typed: async () => true };
const NO_TYPED = { proceed: async () => true, typed: async () => false };
const marker = (ddoc, des) => ({
  managed: true,
  source: `databases/${des.db}/${ddoc}`,
  pushed_at: "2026-01-01T00:00:00Z",
});
const env = { name: "local", protected: false };

describe("applyPlan", () => {
  it("writes creates with the managed marker", async () => {
    const desired = [{ db: "db", ddoc: "main", doc: { views: { v: { map: "M" } } } }];
    const client = fakeClient();
    const plan = buildPlan({ desired, current: [] });

    const res = await applyPlan({ plan, desired, client, env, prune: false, confirm: YES, marker });

    expect(res).toMatchObject({ created: 1, updated: 0, deleted: 0 });
    const stored = client._dbs.get("db").get("_design/main");
    expect(stored.couchman).toMatchObject({ managed: true });
    expect(stored._rev).toBeDefined();
  });

  it("is idempotent — replanning after a push shows no changes (golden)", async () => {
    const { results } = await buildAll(treeDatabases);
    const desired = results.map((r) => ({ db: r.db, ddoc: r.ddoc, doc: r.doc, dir: r.dir }));
    const client = fakeClient();
    await client.createDatabase("mydb");

    const plan1 = buildPlan({ desired, current: [] });
    expect(plan1.summary.create).toBe(1);
    await applyPlan({ plan: plan1, desired, client, env, prune: false, confirm: YES, marker });

    const current = await fetchCurrent(client, ["mydb"]);
    const plan2 = buildPlan({ desired, current });
    expect(planHasChanges(plan2)).toBe(false);
    expect(plan2.ddocs.every((d) => d.op === "noop")).toBe(true);
  });

  it("treats a stale _rev as a conflict, not a silent retry", async () => {
    const desired = [{ db: "db", ddoc: "main", doc: { views: { v: { map: "NEW" } } } }];
    const seeded = {
      db: [
        {
          _id: "_design/main",
          _rev: "1-old",
          couchman: { managed: true },
          views: { v: { map: "OLD" } },
        },
      ],
    };
    const client = fakeClient(seeded);
    const current = await fetchCurrent(client, ["db"]);
    const plan = buildPlan({ desired, current }); // update with rev 1-old

    // Someone else writes in the meantime.
    client._dbs.get("db").get("_design/main")._rev = "9-changed";

    await expect(
      applyPlan({ plan, desired, client, env, prune: false, confirm: YES, marker }),
    ).rejects.toThrow(/conflict/);
  });

  it("a protected environment requires typing its name (—yes is not enough)", async () => {
    const desired = [{ db: "db", ddoc: "main", doc: { views: { v: { map: "M" } } } }];
    const client = fakeClient();
    const plan = buildPlan({ desired, current: [] });
    const prot = { name: "prod", protected: true };

    const aborted = await applyPlan({
      plan, desired, client, env: prot, prune: false, confirm: NO_TYPED, marker,
    });
    expect(aborted).toMatchObject({ aborted: true, created: 0 });
    expect(client._dbs.get("db")).toBeUndefined();

    const ok = await applyPlan({
      plan, desired, client, env: prot, prune: false, confirm: YES, marker,
    });
    expect(ok.created).toBe(1);
  });

  it("aborts when the user declines", async () => {
    const desired = [{ db: "db", ddoc: "main", doc: { views: { v: { map: "M" } } } }];
    const client = fakeClient();
    const plan = buildPlan({ desired, current: [] });
    const res = await applyPlan({ plan, desired, client, env, prune: false, confirm: NO_PROCEED, marker });
    expect(res.aborted).toBe(true);
    expect(client._dbs.get("db")).toBeUndefined();
  });

  it("only deletes managed docs with --prune and a typed name", async () => {
    const desired = [{ db: "db", ddoc: "main", doc: { views: { v: { map: "M" } } } }];
    const seeded = {
      db: [
        { _id: "_design/main", _rev: "1-a", couchman: { managed: true }, views: { v: { map: "M" } } },
        { _id: "_design/stale", _rev: "1-b", couchman: { managed: true }, views: {} },
      ],
    };

    // Without --prune: the stale doc survives.
    let client = fakeClient(structuredClone(seeded));
    let current = await fetchCurrent(client, ["db"]);
    let plan = buildPlan({ desired, current });
    expect(plan.summary.delete).toBe(1);
    await applyPlan({ plan, desired, client, env, prune: false, confirm: YES, marker });
    expect(client._dbs.get("db").has("_design/stale")).toBe(true);

    // With --prune and the name typed: deleted.
    client = fakeClient(structuredClone(seeded));
    current = await fetchCurrent(client, ["db"]);
    plan = buildPlan({ desired, current });
    const res = await applyPlan({ plan, desired, client, env, prune: true, confirm: YES, marker });
    expect(res.deleted).toBe(1);
    expect(client._dbs.get("db").has("_design/stale")).toBe(false);

    // With --prune but the name NOT typed: skipped, survives.
    client = fakeClient(structuredClone(seeded));
    current = await fetchCurrent(client, ["db"]);
    plan = buildPlan({ desired, current });
    const skip = await applyPlan({ plan, desired, client, env, prune: true, confirm: NO_TYPED, marker });
    expect(skip.skipped).toBe(1);
    expect(client._dbs.get("db").has("_design/stale")).toBe(true);
  });
});
