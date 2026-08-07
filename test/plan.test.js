import { describe, it, expect } from "vitest";
import { diffDdoc, COST, unifiedDiff } from "../src/plan/diff.js";
import { buildPlan, planHasChanges } from "../src/plan/plan.js";
import { formatPlan } from "../src/plan/format.js";

const managed = (doc) => ({
  _id: `_design/${doc._id ?? "main"}`,
  _rev: "1-abc",
  couchman: { managed: true, source: "databases/db/main" },
  ...doc,
});

describe("diffDdoc", () => {
  it("classifies a view change as a view rebuild", () => {
    const d = diffDdoc(
      { views: { by_type: { map: "A" } } },
      { views: { by_type: { map: "B" } } },
    );
    expect(d.viewRebuild).toBe(true);
    expect(d.indexRebuild).toBe(false);
    expect(d.changes).toEqual([
      expect.objectContaining({
        file: "views/by_type/map.js",
        op: "change",
        cost: COST.VIEW,
      }),
    ]);
  });

  it("classifies an index analyzer change as a full index rebuild", () => {
    const d = diffDdoc(
      { indexes: { e: { index: "F", analyzer: "standard" } } },
      { indexes: { e: { index: "F", analyzer: "keyword" } } },
    );
    expect(d.indexRebuild).toBe(true);
    expect(d.changes[0]).toMatchObject({
      file: "indexes/e/meta.json",
      cost: COST.INDEX,
    });
  });

  it("classifies a filter change as free", () => {
    const d = diffDdoc({ filters: { p: "X" } }, { filters: { p: "Y" } });
    expect(d.viewRebuild).toBe(false);
    expect(d.indexRebuild).toBe(false);
    expect(d.changes[0]).toMatchObject({ file: "filters/p.js", cost: COST.FREE });
  });

  it("ignores _rev and the couchman marker", () => {
    const cur = managed({ views: { v: { map: "A" } } });
    const des = { _id: "_design/main", views: { v: { map: "A" } } };
    expect(diffDdoc(cur, des).changes).toEqual([]);
  });
});

describe("buildPlan", () => {
  const desired = [
    { db: "db", ddoc: "main", doc: { views: { v: { map: "NEW" } } } },
  ];

  it("creates a design document absent from the database", () => {
    const plan = buildPlan({ desired, current: [] });
    expect(plan.summary).toMatchObject({ create: 1, update: 0, delete: 0 });
    expect(plan.ddocs[0].op).toBe("create");
    expect(planHasChanges(plan)).toBe(true);
  });

  it("updates a managed document that differs", () => {
    const current = [
      { db: "db", ddoc: "main", doc: managed({ views: { v: { map: "OLD" } } }) },
    ];
    const plan = buildPlan({ desired, current });
    expect(plan.ddocs[0]).toMatchObject({ op: "update", rev: "1-abc" });
    expect(plan.summary.update).toBe(1);
  });

  it("is a no-op when a managed document already matches", () => {
    const current = [
      { db: "db", ddoc: "main", doc: managed({ views: { v: { map: "NEW" } } }) },
    ];
    const plan = buildPlan({ desired, current });
    expect(plan.ddocs[0].op).toBe("noop");
    expect(planHasChanges(plan)).toBe(false);
  });

  it("ignores and warns about an unmanaged document", () => {
    const current = [
      { db: "db", ddoc: "main", doc: { _id: "_design/main", _rev: "9-z", views: {} } },
    ];
    const plan = buildPlan({ desired, current });
    expect(plan.ddocs[0].op).toBe("ignore");
    expect(plan.ddocs[0].warning).toMatch(/unmanaged/);
    expect(plan.summary.warnings).toBe(1);
  });

  it("marks a managed document missing from the tree for deletion", () => {
    const current = [
      { db: "db", ddoc: "stale", doc: managed({ _id: "stale", views: {} }) },
    ];
    const plan = buildPlan({ desired, current });
    const del = plan.ddocs.find((d) => d.ddoc === "stale");
    expect(del.op).toBe("delete");
    expect(plan.summary.delete).toBe(1);
  });

  it("never deletes an unmanaged document missing from the tree", () => {
    const current = [
      { db: "db", ddoc: "handmade", doc: { _id: "_design/handmade", _rev: "3-y" } },
    ];
    const plan = buildPlan({ desired, current });
    expect(plan.ddocs.find((d) => d.ddoc === "handmade").op).toBe("ignore");
    expect(plan.summary.delete).toBe(0);
  });
});

describe("formatPlan", () => {
  it("renders the terse summary form", () => {
    const plan = buildPlan({
      desired: [
        { db: "db", ddoc: "main", doc: { views: { v: { map: "NEW" } }, filters: { p: "P" } } },
      ],
      current: [],
    });
    const out = formatPlan(plan);
    expect(out).toContain("db/_design/main");
    expect(out).toMatch(/\+ views\/v\/map\.js/);
    expect(out).toMatch(/1 database, \+1 ~0 -0/);
  });

  it("shows a unified diff under verbose", () => {
    const plan = buildPlan({
      desired: [{ db: "db", ddoc: "main", doc: { views: { v: { map: "line1\nCHANGED" } } } }],
      current: [
        { db: "db", ddoc: "main", doc: managed({ views: { v: { map: "line1\nOLD" } } }) },
      ],
    });
    const out = formatPlan(plan, { verbose: true });
    expect(out).toContain("-OLD");
    expect(out).toContain("+CHANGED");
    expect(out).toContain(" line1"); // context line
  });
});

describe("unifiedDiff", () => {
  it("emits context, removed and added lines", () => {
    expect(unifiedDiff("a\nb\nc", "a\nx\nc")).toEqual([" a", "-b", "+x", " c"]);
  });
});
