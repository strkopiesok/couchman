import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyFixtures, FIXTURE_KEY } from "../src/fixtures/apply.js";
import { loadFixtures } from "../src/fixtures/load.js";
import { CouchmanError } from "../src/errors.js";

function fakeClient(seed = {}) {
  const store = new Map(Object.entries(seed));
  let n = 0;
  return {
    _store: store,
    async getDocument(_db, id) {
      return store.get(id) ?? null;
    },
    async putDocument(_db, doc) {
      const rev = `${++n}-r`;
      store.set(doc._id, { ...doc, _rev: rev });
      return { ok: true, rev };
    },
  };
}

describe("applyFixtures", () => {
  it("inserts new documents with a stored hash", async () => {
    const client = fakeClient();
    const res = await applyFixtures(client, "db", [{ _id: "a", value: 1 }]);
    expect(res).toMatchObject({ inserted: 1, updated: 0, unchanged: 0 });
    expect(client._store.get("a")[FIXTURE_KEY].hash).toBeTypeOf("string");
  });

  it("is a no-op when nothing changed", async () => {
    const client = fakeClient();
    await applyFixtures(client, "db", [{ _id: "a", value: 1 }]);
    const res = await applyFixtures(client, "db", [{ _id: "a", value: 1 }]);
    expect(res).toMatchObject({ inserted: 0, unchanged: 1 });
  });

  it("updates a document couchman still owns", async () => {
    const client = fakeClient();
    await applyFixtures(client, "db", [{ _id: "a", value: 1 }]);
    const res = await applyFixtures(client, "db", [{ _id: "a", value: 2 }]);
    expect(res).toMatchObject({ updated: 1 });
    expect(client._store.get("a").value).toBe(2);
  });

  it("reports a conflict and never overwrites a human-edited document", async () => {
    const client = fakeClient();
    await applyFixtures(client, "db", [{ _id: "a", value: 1 }]);
    // A human edits the document out of band (hash no longer matches content).
    client._store.get("a").value = 999;

    const res = await applyFixtures(client, "db", [{ _id: "a", value: 2 }]);
    expect(res.conflicts).toEqual(["a"]);
    expect(res.updated).toBe(0);
    expect(client._store.get("a").value).toBe(999); // left alone
  });

  it("rejects a fixture without _id", async () => {
    await expect(applyFixtures(fakeClient(), "db", [{ value: 1 }])).rejects.toThrow(
      CouchmanError,
    );
  });
});

describe("loadFixtures", () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "couchman-fix-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("loads single-doc and array files, requiring _id", async () => {
    await mkdir(path.join(dir, "mydb"), { recursive: true });
    await writeFile(path.join(dir, "mydb", "one.json"), JSON.stringify({ _id: "x" }));
    await writeFile(
      path.join(dir, "mydb", "many.json"),
      JSON.stringify([{ _id: "y" }, { _id: "z" }]),
    );
    const docs = await loadFixtures(dir, "mydb");
    expect(docs.map((d) => d._id).sort()).toEqual(["x", "y", "z"]);
  });

  it("returns nothing when the database has no fixtures dir", async () => {
    expect(await loadFixtures(dir, "absent")).toEqual([]);
  });

  it("rejects a fixture file missing _id", async () => {
    await mkdir(path.join(dir, "mydb"), { recursive: true });
    await writeFile(path.join(dir, "mydb", "bad.json"), JSON.stringify({ nope: 1 }));
    await expect(loadFixtures(dir, "mydb")).rejects.toThrow(/missing _id/);
  });
});
