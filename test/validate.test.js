import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { buildAll } from "../src/build/build.js";

const dbDir = (name) =>
  fileURLToPath(new URL(`./fixtures/${name}/databases`, import.meta.url));

describe("buildAll (validate core)", () => {
  it("builds a valid tree with no errors", async () => {
    const { results } = await buildAll(dbDir("tree"));
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.error).toBeUndefined();
    expect(r.warnings).toEqual([]);
    // functions are bundled to ES5 (no arrow/const in the map output)
    expect(r.doc.views.by_type.map).not.toMatch(/=>|\bconst\b/);
    expect(r.doc.views.by_type.reduce).toBe("_count");
  });

  it("reports bundling errors per design document", async () => {
    // The bundle fixtures contain views with a bare import and a cross-view
    // import — both must fail bundling.
    const { results } = await buildAll(dbDir("bundle"), {
      continueOnError: true,
    });
    const failed = results.filter((r) => r.error);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => typeof r.error === "string")).toBe(true);
  });

  it("stops at the first error without continueOnError", async () => {
    const { results } = await buildAll(dbDir("bundle"));
    // At least one result, and building stopped once an error was hit.
    const firstError = results.findIndex((r) => r.error);
    expect(firstError).toBe(results.length - 1);
  });
});
