import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { CouchmanError } from "../errors.js";

const VIEW_MAP = `export default function (doc) {
  // emit(key, value);
}
`;

const INDEX_FN = `export default function (doc) {
  // index("field", doc.field, { store: true });
}
`;

const INDEX_META = `{
  "analyzer": "standard"
}
`;

/**
 * @param {string} p
 * @returns {Promise<boolean>}
 */
async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scaffold a new view or index under `databasesDir`.
 *
 * @param {string} databasesDir  Absolute path to the databases directory.
 * @param {"view"|"index"} kind
 * @param {string} spec          "db/ddoc/name"
 * @returns {Promise<{ dir: string, files: string[] }>}
 */
export async function scaffold(databasesDir, kind, spec) {
  if (kind !== "view" && kind !== "index") {
    throw new CouchmanError(`unknown kind "${kind}" (expected view or index)`);
  }
  const parts = String(spec).split("/");
  if (parts.length !== 3 || parts.some((p) => p === "")) {
    throw new CouchmanError(`path must be db/ddoc/name, got "${spec}"`);
  }
  const [db, ddoc, name] = parts;

  const group = kind === "view" ? "views" : "indexes";
  const dir = path.join(databasesDir, db, ddoc, group, name);
  if (await exists(dir)) {
    throw new CouchmanError(
      `${kind} already exists: ${path.relative(process.cwd(), dir)}`,
    );
  }

  await mkdir(dir, { recursive: true });
  const files = [];
  if (kind === "view") {
    const f = path.join(dir, "map.js");
    await writeFile(f, VIEW_MAP);
    files.push(f);
  } else {
    const fn = path.join(dir, "index.js");
    const meta = path.join(dir, "meta.json");
    await writeFile(fn, INDEX_FN);
    await writeFile(meta, INDEX_META);
    files.push(fn, meta);
  }
  return { dir, files };
}
