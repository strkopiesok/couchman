import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { scaffold } from "../src/build/scaffold.js";
import { assembleDdoc } from "../src/tree/assemble.js";
import { CouchmanError } from "../src/errors.js";

let base;
beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), "couchman-scaffold-"));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("scaffold", () => {
  it("creates a view map.js", async () => {
    const { files } = await scaffold(base, "view", "mydb/main/by_type");
    expect(files).toHaveLength(1);
    const src = await readFile(files[0], "utf8");
    expect(src).toContain("export default function");
    expect(files[0].endsWith(path.join("views", "by_type", "map.js"))).toBe(true);
  });

  it("creates an index index.js and meta.json", async () => {
    const { files } = await scaffold(base, "index", "mydb/search/entities");
    expect(files).toHaveLength(2);
    const meta = await readFile(
      files.find((f) => f.endsWith("meta.json")),
      "utf8",
    );
    expect(JSON.parse(meta)).toEqual({ analyzer: "standard" });
  });

  it("produces a tree that assembles cleanly", async () => {
    await scaffold(base, "view", "mydb/main/by_type");
    const ddocDir = path.join(base, "mydb", "main");
    const { doc, warnings } = await assembleDdoc(ddocDir, "main");
    expect(warnings).toEqual([]);
    expect(doc.views.by_type.map).toContain("export default function");
  });

  it("refuses to overwrite an existing artifact", async () => {
    await scaffold(base, "view", "mydb/main/by_type");
    await expect(scaffold(base, "view", "mydb/main/by_type")).rejects.toThrow(
      /already exists/,
    );
  });

  it("rejects a malformed path and unknown kind", async () => {
    await expect(scaffold(base, "view", "too/short")).rejects.toThrow(
      CouchmanError,
    );
    await expect(scaffold(base, "widget", "a/b/c")).rejects.toThrow(
      /unknown kind/,
    );
  });
});
