import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadDatabases } from "../src/tree/load.js";
import { assembleDdoc } from "../src/tree/assemble.js";

const databasesDir = fileURLToPath(
  new URL("./fixtures/tree/databases", import.meta.url),
);
const mainDir = path.join(databasesDir, "mydb", "main");

describe("assembleDdoc", () => {
  it("assembles the design document from the tree", async () => {
    const { doc, warnings } = await assembleDdoc(mainDir, "main");
    expect(warnings).toEqual([]);

    expect(doc._id).toBe("_design/main");
    expect(doc.language).toBe("javascript");
    expect(doc.options).toEqual({ partitioned: false });
    expect(doc.autoupdate).toBe(true);

    // map from file, reduce is the builtin from ddoc meta.json
    expect(doc.views.by_type.map).toContain("emit(doc.type, 1)");
    expect(doc.views.by_type.reduce).toBe("_count");

    // reduce from reduce.js (no builtin in meta)
    expect(doc.views.by_case_children.reduce).toContain("values.length");

    // Clouseau index: function in "index", analyzer from per-index meta.json
    expect(doc.indexes.entities.index).toContain('doc.type !== "article"');
    expect(doc.indexes.entities.analyzer).toBe("standard");
    expect(doc.indexes.entities.default_analyzer).toBe("keyword");

    expect(doc.filters.published).toContain("doc.published === true");
    expect(doc.validate_doc_update).toContain("type is required");
  });

  it("is deterministic — assembling twice yields identical output (golden)", async () => {
    const a = await assembleDdoc(mainDir, "main");
    const b = await assembleDdoc(mainDir, "main");
    expect(a.doc).toEqual(b.doc);
  });
});

describe("loadDatabases", () => {
  it("discovers every database and design document", async () => {
    const { ddocs, warnings } = await loadDatabases(databasesDir);
    expect(warnings).toEqual([]);
    expect(ddocs).toHaveLength(1);
    expect(ddocs[0]).toMatchObject({ db: "mydb", ddoc: "main" });
    expect(ddocs[0].doc._id).toBe("_design/main");
  });
});
