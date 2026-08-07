import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { bundleFunction } from "../src/bundle/bundle.js";
import { CouchmanError } from "../src/errors.js";

const treeRoot = fileURLToPath(new URL("./fixtures/bundle", import.meta.url));
const view = (name) =>
  path.join(treeRoot, "databases", "mydb", "main", "views", name, "map.js");

/** Evaluate a bundled function expression with a captured `emit`. */
function runView(code, doc) {
  const emitted = [];
  const emit = (k, v) => emitted.push([k, v]);
  const fn = new Function("emit", `return (${code});`)(emit);
  fn(doc);
  return emitted;
}

describe("bundleFunction", () => {
  it("produces an ES5 IIFE that evaluates to the function", async () => {
    const code = await bundleFunction({ entryFile: view("simple"), treeRoot });
    // ES5: no arrow functions, no let/const in the output
    expect(code).not.toMatch(/=>/);
    expect(code).not.toMatch(/\b(const|let)\b/);
    expect(code.trimStart().startsWith("(function")).toBe(true);
    expect(runView(code, { n: 3 })).toEqual([[3, 6]]);
  });

  it("bundles imports from shared/", async () => {
    const code = await bundleFunction({ entryFile: view("withshared"), treeRoot });
    expect(runView(code, { title: "café" })).toEqual([["cafe", 1]]);
  });

  it("bundles imports from _lib/", async () => {
    const code = await bundleFunction({ entryFile: view("withlib"), treeRoot });
    expect(runView(code, { n: 4 })).toEqual([[5, 1]]);
  });

  it("emits an inline function literal when wrap=inline", async () => {
    const code = await bundleFunction({
      entryFile: view("simple"),
      treeRoot,
      wrap: "inline",
    });
    expect(code.trimStart().startsWith("function")).toBe(true);
    expect(runView(code, { n: 5 })).toEqual([[5, 10]]);
  });

  it("rejects a bare (node_modules) import", async () => {
    await expect(
      bundleFunction({ entryFile: view("badimport"), treeRoot }),
    ).rejects.toThrow(/no .*node_modules|not allowed/);
  });

  it("rejects an import outside _lib/ or shared/", async () => {
    await expect(
      bundleFunction({ entryFile: view("crossref"), treeRoot }),
    ).rejects.toThrow(CouchmanError);
  });
});
