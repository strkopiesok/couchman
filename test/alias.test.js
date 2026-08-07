import { describe, it, expect } from "vitest";
import { setAlias, renameForAlias, ALIAS_ID } from "../src/push/alias.js";
import { CouchmanError } from "../src/errors.js";

describe("setAlias", () => {
  it("creates the aliases document on first use", () => {
    const { doc, prev } = setAlias(null, "search_v2", "search");
    expect(doc).toEqual({ _id: ALIAS_ID, search: "search_v2" });
    expect(prev).toBeUndefined();
  });

  it("flips an existing alias, preserving _rev and other aliases", () => {
    const existing = {
      _id: ALIAS_ID,
      _rev: "3-x",
      search: "search_v1",
      reports: "reports_v4",
    };
    const { doc, prev } = setAlias(existing, "search_v2", "search");
    expect(prev).toBe("search_v1");
    expect(doc).toEqual({
      _id: ALIAS_ID,
      _rev: "3-x",
      search: "search_v2",
      reports: "reports_v4",
    });
  });
});

describe("renameForAlias", () => {
  it("renames a single design document", () => {
    const desired = [{ db: "db", ddoc: "search", doc: { views: {} }, dir: "/x" }];
    expect(renameForAlias(desired, "search_v2")).toEqual([
      { db: "db", ddoc: "search_v2", doc: { views: {} }, dir: "/x" },
    ]);
  });

  it("requires exactly one target", () => {
    expect(() => renameForAlias([], "x")).toThrow(CouchmanError);
    expect(() =>
      renameForAlias(
        [
          { db: "db", ddoc: "a", doc: {} },
          { db: "db", ddoc: "b", doc: {} },
        ],
        "x",
      ),
    ).toThrow(/exactly one/);
  });
});
