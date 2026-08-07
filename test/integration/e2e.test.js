import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, copyFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startCouch, authHeaders } from "./couch.js";
import { run } from "../../src/cli.js";

const repoShared = fileURLToPath(new URL("../../shared/normalize.js", import.meta.url));

let couch;
let db;
let cwd;
let outDir;
let H;

const api = (p, init) => fetch(`${couch.baseUrl}${p}`, { headers: H, ...init });

/** Run the real CLI in the temp project, returning its exit code. */
async function runCli(args) {
  const prevCwd = process.cwd();
  const prevExit = process.exitCode;
  process.chdir(cwd);
  process.exitCode = 0;
  try {
    await run(["node", "couchman", ...args]);
    return process.exitCode || 0;
  } finally {
    process.chdir(prevCwd);
    process.exitCode = prevExit;
  }
}

beforeAll(async () => {
  couch = await startCouch();
  H = authHeaders(couch.user, couch.password);
  db = `couchman_it_${Date.now()}`;
  cwd = await mkdtemp(path.join(tmpdir(), "couchman-it-"));
  outDir = await mkdtemp(path.join(tmpdir(), "couchman-it-out-"));

  const main = path.join(cwd, "couch", "databases", db, "main");
  await mkdir(path.join(main, "views", "by_type"), { recursive: true });
  await writeFile(
    path.join(main, "views", "by_type", "map.js"),
    'const KIND = "any";\nexport default (doc) => { if (doc.type) emit(doc.type, 1); };\n',
  );

  await mkdir(path.join(cwd, "couch", "shared"), { recursive: true });
  await copyFile(repoShared, path.join(cwd, "couch", "shared", "normalize.js"));

  if (couch.hasSearch) {
    await mkdir(path.join(main, "indexes", "entities"), { recursive: true });
    await writeFile(
      path.join(main, "indexes", "entities", "index.js"),
      'import { deaccent } from "../../../../../shared/normalize.js";\n' +
        "export default function (doc) {\n" +
        '  if (doc.type !== "article") return;\n' +
        '  index("title", doc.title, { store: true });\n' +
        '  index("title_norm", deaccent(doc.title));\n' +
        "}\n",
    );
    await writeFile(
      path.join(main, "indexes", "entities", "meta.json"),
      '{ "analyzer": "standard" }\n',
    );
  }

  await mkdir(path.join(cwd, "couch", "fixtures", db), { recursive: true });
  await writeFile(
    path.join(cwd, "couch", "fixtures", db, "seed.json"),
    JSON.stringify([{ _id: "config:app", name: "Demo", version: 1 }]),
  );

  const url = new URL(couch.baseUrl);
  if (couch.user) {
    url.username = encodeURIComponent(couch.user);
    url.password = encodeURIComponent(couch.password ?? "");
  }
  await writeFile(
    path.join(cwd, "couchman.config.js"),
    `import { defineConfig } from "file://${fileURLToPath(new URL("../../src/index.js", import.meta.url))}";\n` +
      `export default defineConfig({ environments: { local: { url: "${url.toString()}" } }, databases: ["${db}"] });\n`,
  );
}, 240_000);

afterAll(async () => {
  if (couch) {
    await api(`/${db}`, { method: "DELETE" }).catch(() => {});
    await couch.teardown();
  }
  await rm(cwd, { recursive: true, force: true }).catch(() => {});
  await rm(outDir, { recursive: true, force: true }).catch(() => {});
});

describe("end-to-end against real CouchDB", () => {
  it("validate passes offline", async () => {
    expect(await runCli(["validate"])).toBe(0);
  });

  it("push --create-db creates the database and a managed design document", async () => {
    expect(await runCli(["push", "--create-db", "--yes"])).toBe(0);
    const doc = await (await api(`/${db}/_design/main`)).json();
    expect(doc.couchman.managed).toBe(true);
    expect(doc.couchman.source).toContain("main");
    // stored function is ES5 (no arrow), and executes below
    expect(/=>/.test(doc.views.by_type.map)).toBe(false);
  });

  it("the view executes in the SpiderMonkey query server", async () => {
    for (const d of [
      { _id: "a1", type: "article", title: "Café Society" },
      { _id: "a2", type: "article", title: "Zvončeky" },
      { _id: "o1", type: "other", title: "x" },
    ]) {
      await api(`/${db}/${d._id}`, { method: "PUT", body: JSON.stringify(d) });
    }
    const view = await (await api(`/${db}/_design/main/_view/by_type`)).json();
    expect(view.rows.length).toBe(3);
  });

  it("search executes via Clouseau (deaccent runs in-server)", async () => {
    if (!couch.hasSearch) return; // environment without search
    await runCli(["warm", "--indexes"]);
    const res = await (
      await api(`/${db}/_design/main/_search/entities?q=title_norm:cafe`)
    ).json();
    expect(res.total_rows).toBe(1);
    expect(res.rows[0].fields.title).toBe("Café Society");
  });

  it("plan is a no-op after push (golden, exit 0)", async () => {
    expect(await runCli(["plan"])).toBe(0);
  });

  it("fixtures push inserts, then never overwrites a human edit", async () => {
    expect(await runCli(["fixtures", "push"])).toBe(0);
    let doc = await (await api(`/${db}/config:app`)).json();
    expect(doc.name).toBe("Demo");

    // Human edits the document out of band.
    doc.name = "HAND EDITED";
    await api(`/${db}/config:app`, { method: "PUT", body: JSON.stringify(doc) });

    expect(await runCli(["fixtures", "push"])).toBe(0);
    doc = await (await api(`/${db}/config:app`)).json();
    expect(doc.name).toBe("HAND EDITED"); // left alone
  });

  it("blue/green: push --as then promote flips couchman:aliases", async () => {
    expect(await runCli(["push", "--as=main_v2", "--yes"])).toBe(0);
    expect((await api(`/${db}/_design/main_v2`)).status).toBe(200);
    expect((await api(`/${db}/_design/main`)).status).toBe(200); // both coexist

    expect(await runCli(["promote", "main_v2", "main"])).toBe(0);
    const aliases = await (await api(`/${db}/couchman:aliases`)).json();
    expect(aliases.main).toBe("main_v2");
  });

  it("pull adopts the database into a tree", async () => {
    expect(await runCli(["pull", "--db", db, "--out", outDir])).toBe(0);
    const files = await readdir(path.join(outDir, "main", "views", "by_type"));
    expect(files).toContain("map.js");
  });
});
