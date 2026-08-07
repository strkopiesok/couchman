import { describe, it, expect } from "vitest";
import { viewTargets, searchTargets, hasSearchIndexes } from "../src/couch/targets.js";
import { warmAll } from "../src/couch/warm.js";
import { collectInfo, humanBytes } from "../src/couch/info.js";

const desired = [
  { db: "a", ddoc: "main", doc: { views: { v1: {}, v2: {} }, indexes: { i1: {} } } },
  { db: "a", ddoc: "other", doc: { views: {}, indexes: {} } },
  { db: "b", ddoc: "s", doc: { indexes: { bad: {} } } },
];

function spyClient() {
  const calls = { warmView: [], warmSearch: [], searchInfo: [] };
  return {
    calls,
    async warmView(db, ddoc, view) {
      calls.warmView.push([db, ddoc, view]);
    },
    async warmSearch(db, ddoc, index) {
      calls.warmSearch.push([db, ddoc, index]);
    },
    async searchInfo(db, ddoc, index) {
      calls.searchInfo.push([db, ddoc, index]);
      if (index === "bad") throw new Error("boom");
      return {
        search_index: { disk_size: 2048, doc_count: 3, pending_seq: 5, committed_seq: 5 },
      };
    },
  };
}

describe("targets", () => {
  it("derives view and search targets from the tree", () => {
    expect(viewTargets(desired)).toEqual([
      { db: "a", ddoc: "main", view: "v1" },
      { db: "a", ddoc: "main", view: "v2" },
    ]);
    expect(searchTargets(desired)).toEqual([
      { db: "a", ddoc: "main", index: "i1" },
      { db: "b", ddoc: "s", index: "bad" },
    ]);
    expect(hasSearchIndexes(desired)).toBe(true);
    expect(hasSearchIndexes([{ db: "x", ddoc: "y", doc: { views: { v: {} } } }])).toBe(false);
  });
});

describe("warmAll", () => {
  it("warms every view and index and reports counts", async () => {
    const client = spyClient();
    const res = await warmAll(client, {
      viewTargets: viewTargets(desired),
      searchTargets: searchTargets(desired),
    });
    expect(res).toEqual({ views: 2, indexes: 2 });
    expect(client.calls.warmView).toHaveLength(2);
    expect(client.calls.warmSearch).toEqual([
      ["a", "main", "i1"],
      ["b", "s", "bad"],
    ]);
  });
});

describe("collectInfo", () => {
  it("maps index info and captures per-index errors", async () => {
    const client = spyClient();
    const { indexes } = await collectInfo(client, {
      searchTargets: searchTargets(desired),
    });
    expect(indexes[0]).toMatchObject({
      index: "i1",
      diskSize: 2048,
      docCount: 3,
      building: false,
    });
    expect(indexes[1]).toMatchObject({ index: "bad", error: "boom" });
  });
});

describe("humanBytes", () => {
  it("formats byte counts", () => {
    expect(humanBytes(0)).toBe("0B");
    expect(humanBytes(2048)).toBe("2.0KB");
    expect(humanBytes(undefined)).toBe("?");
  });
});
