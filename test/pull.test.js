import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { decomposeDdoc } from "../src/pull/decompose.js";
import { assembleDdoc } from "../src/tree/assemble.js";

const sampleDoc = {
  _id: "_design/main",
  _rev: "5-abc",
  couchman: { managed: true },
  language: "javascript",
  options: { partitioned: false },
  views: {
    by_type: { map: "function (doc) { emit(doc.type, 1); }", reduce: "_count" },
    totals: {
      map: "function (doc) { emit(doc.k, doc.v); }",
      reduce: "function (k, v) { return sum(v); }",
    },
  },
  indexes: {
    entities: { index: "function (doc) { index('t', doc.t); }", analyzer: "standard" },
  },
  filters: { published: "function (doc) { return doc.published; }" },
  validate_doc_update: "function (n) { if (!n.type) throw {forbidden:'x'}; }",
};

describe("decomposeDdoc", () => {
  it("splits a design document into the expected files", () => {
    const rels = decomposeDdoc(sampleDoc)
      .map((f) => f.rel)
      .sort();
    expect(rels).toEqual(
      [
        "views/by_type/map.js",
        "views/totals/map.js",
        "views/totals/reduce.js",
        "indexes/entities/index.js",
        "indexes/entities/meta.json",
        "filters/published.js",
        "validate_doc_update.js",
        "meta.json",
      ].sort(),
    );
  });

  it("routes a builtin reduce to meta.json, a function reduce to reduce.js", () => {
    const files = decomposeDdoc(sampleDoc);
    const meta = JSON.parse(files.find((f) => f.rel === "meta.json").content);
    expect(meta.views.by_type.reduce).toBe("_count");
    expect(files.some((f) => f.rel === "views/by_type/reduce.js")).toBe(false);
    expect(files.some((f) => f.rel === "views/totals/reduce.js")).toBe(true);
  });

  it("drops _rev, _id and the couchman marker", () => {
    const contents = decomposeDdoc(sampleDoc)
      .map((f) => f.content)
      .join("\n");
    expect(contents).not.toMatch(/_rev|couchman|_design/);
  });
});

describe("pull → assemble round-trip", () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "couchman-pull-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("a decomposed tree reassembles into an equivalent document", async () => {
    for (const f of decomposeDdoc(sampleDoc)) {
      const full = path.join(dir, f.rel);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, f.content);
    }
    const { doc } = await assembleDdoc(dir, "main");

    expect(doc.views.by_type.reduce).toBe("_count");
    expect(doc.views.by_type.map).toContain("emit(doc.type, 1)");
    expect(doc.views.totals.reduce).toContain("return sum(v)");
    expect(doc.indexes.entities.analyzer).toBe("standard");
    expect(doc.filters.published).toContain("doc.published");
    expect(doc.options).toEqual({ partitioned: false });
  });
});
