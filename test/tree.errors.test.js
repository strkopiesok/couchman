import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assembleDdoc } from "../src/tree/assemble.js";
import { readText } from "../src/tree/text.js";
import { CouchmanError } from "../src/errors.js";

let dir;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "couchman-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Create a minimal ddoc dir with one view so it is otherwise valid. */
async function baseDdoc(root) {
  await mkdir(path.join(root, "views", "by_type"), { recursive: true });
  await writeFile(path.join(root, "views", "by_type", "map.js"), "function(){}");
}

describe("tree errors", () => {
  it("rejects an unknown directory", async () => {
    await baseDdoc(dir);
    await mkdir(path.join(dir, "widgets"));
    await expect(assembleDdoc(dir, "main")).rejects.toThrow(
      /unknown directory "widgets"/,
    );
  });

  it("rejects an unknown root file", async () => {
    await baseDdoc(dir);
    await writeFile(path.join(dir, "notes.txt"), "hi");
    await expect(assembleDdoc(dir, "main")).rejects.toThrow(
      /unknown file "notes.txt"/,
    );
  });

  it("rejects a non-.js file in a function dir", async () => {
    await mkdir(path.join(dir, "filters"), { recursive: true });
    await writeFile(path.join(dir, "filters", "x.txt"), "nope");
    await expect(assembleDdoc(dir, "main")).rejects.toThrow(
      /unknown extension for "x.txt"/,
    );
  });

  it("rejects a view with both reduce.js and a builtin reduce", async () => {
    await mkdir(path.join(dir, "views", "v"), { recursive: true });
    await writeFile(path.join(dir, "views", "v", "map.js"), "function(){}");
    await writeFile(path.join(dir, "views", "v", "reduce.js"), "function(){}");
    await writeFile(
      path.join(dir, "meta.json"),
      JSON.stringify({ views: { v: { reduce: "_count" } } }),
    );
    await expect(assembleDdoc(dir, "main")).rejects.toThrow(
      /both reduce.js and a reduce in meta.json/,
    );
  });

  it("warns on names outside [a-z0-9_], errors under --strict", async () => {
    await mkdir(path.join(dir, "views", "byType"), { recursive: true });
    await writeFile(path.join(dir, "views", "byType", "map.js"), "function(){}");

    const { warnings } = await assembleDdoc(dir, "main");
    expect(warnings).toEqual([
      expect.stringMatching(/view name "byType" contains characters outside/),
    ]);

    await expect(assembleDdoc(dir, "main", { strict: true })).rejects.toThrow(
      CouchmanError,
    );
  });

  it("ignores dotfiles and underscore entries except _lib", async () => {
    await baseDdoc(dir);
    await writeFile(path.join(dir, ".DS_Store"), "junk");
    await mkdir(path.join(dir, "_scratch"));
    const { doc } = await assembleDdoc(dir, "main");
    expect(Object.keys(doc.views)).toEqual(["by_type"]);
  });
});

describe("readText normalisation", () => {
  it("strips a BOM and converts CRLF/CR to LF", async () => {
    const file = path.join(dir, "f.js");
    await writeFile(file, "﻿a\r\nb\rc\n");
    expect(await readText(file)).toBe("a\nb\nc\n");
  });
});
