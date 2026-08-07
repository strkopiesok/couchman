import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { bundleFunction } from "../src/bundle/bundle.js";

const treeRoot = fileURLToPath(new URL("./fixtures/bundle", import.meta.url));
const legacyMap = path.join(
  treeRoot,
  "databases",
  "mydb",
  "main",
  "views",
  "legacy",
  "map.js",
);

function runView(code, doc) {
  const emitted = [];
  const emit = (k, v) => emitted.push([k, v]);
  new Function("emit", `return (${code});`)(emit)(doc);
  return emitted;
}

describe("legacy //INCLUDE:", () => {
  it("expands the directive and warns, and the result runs", async () => {
    const warnings = [];
    const code = await bundleFunction({
      entryFile: legacyMap,
      treeRoot,
      onWarn: (m) => warnings.push(m),
    });

    expect(warnings.some((w) => /INCLUDE.*deprecated/.test(w))).toBe(true);
    expect(code).not.toMatch(/INCLUDE/); // directive is gone
    expect(runView(code, { n: 4 })).toEqual([[5, 1]]); // bump(4) === 5
  });
});
