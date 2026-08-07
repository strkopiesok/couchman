import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { CouchmanError } from "../errors.js";
import { readText, readJson } from "./text.js";
import { nfc, isIgnored, checkName } from "./names.js";

// A design document is assembled from a directory tree by one rule: a directory
// is a map of functions, a file at the root is a scalar field. Unknown
// directories or extensions are errors, never silent skips — silently ignoring
// input is the worst possible default in a tool that writes to production.

/** Directories whose entries are a single `.js` file each. */
const FUNCTION_DIRS = new Set(["filters", "updates", "shows", "lists"]);
const KNOWN_DIRS = new Set(["views", "indexes", ...FUNCTION_DIRS]);

/**
 * @typedef {(msg: string) => void} Note  Records a warning, or throws under --strict.
 */

/**
 * Assemble one design document from its directory.
 *
 * Function bodies are produced by `buildFn(entryFile) => Promise<string>`,
 * which defaults to reading raw normalised text. `validate`/`plan`/`push` pass
 * a `buildFn` that bundles and transpiles to ES5 instead.
 *
 * @param {string} ddocDir  Absolute path to the design-document directory.
 * @param {string} ddocName NFC design-document name.
 * @param {{ strict?: boolean, buildFn?: (file: string) => Promise<string> }} [opts]
 * @returns {Promise<{ doc: Record<string, any>, warnings: string[] }>}
 */
export async function assembleDdoc(
  ddocDir,
  ddocName,
  { strict = false, buildFn = readText } = {},
) {
  const warnings = [];
  /** @type {Note} */
  const note = (msg) => {
    if (strict) throw new CouchmanError(msg);
    warnings.push(msg);
  };

  checkName(ddocName, "design-document", note);

  const metaPath = path.join(ddocDir, "meta.json");
  const meta = existsSync(metaPath) ? await readJson(metaPath) : {};

  const doc = {
    _id: `_design/${ddocName}`,
    language: meta.language ?? "javascript",
  };
  if (meta.options !== undefined) doc.options = meta.options;
  if (meta.autoupdate !== undefined) doc.autoupdate = meta.autoupdate;

  for (const entry of await readdir(ddocDir, { withFileTypes: true })) {
    const name = nfc(entry.name);
    if (name === "meta.json" || isIgnored(name)) continue;
    const full = path.join(ddocDir, name);

    if (entry.isDirectory()) {
      if (name === "views") {
        doc.views = await readViews(full, meta.views ?? {}, note, buildFn);
      } else if (name === "indexes") {
        doc.indexes = await readIndexes(full, note, buildFn);
      } else if (FUNCTION_DIRS.has(name)) {
        doc[name] = await readFunctionDir(full, name, note, buildFn);
      } else {
        throw new CouchmanError(
          `unknown directory "${name}" in design document "${ddocName}" ` +
            `(expected one of: ${[...KNOWN_DIRS].join(", ")})`,
        );
      }
    } else if (name === "validate_doc_update.js") {
      doc.validate_doc_update = await buildFn(full);
    } else if (name === "rewrites.json") {
      doc.rewrites = await readJson(full);
    } else {
      throw new CouchmanError(
        `unknown file "${name}" at the root of design document "${ddocName}"`,
      );
    }
  }

  return { doc, warnings };
}

/**
 * @param {string} dir
 * @param {Record<string, { reduce?: string }>} metaViews
 * @param {Note} note
 * @param {(file: string) => Promise<string>} buildFn
 */
async function readViews(dir, metaViews, note, buildFn) {
  /** @type {Record<string, any>} */
  const views = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = nfc(entry.name);
    if (isIgnored(name)) continue;
    if (!entry.isDirectory()) {
      throw new CouchmanError(
        `views/${name} must be a directory (a view is a folder with map.js)`,
      );
    }
    checkName(name, "view", note);

    const viewDir = path.join(dir, name);
    await assertOnly(viewDir, new Set(["map.js", "reduce.js"]), `view "${name}"`);

    const mapPath = path.join(viewDir, "map.js");
    if (!existsSync(mapPath)) {
      throw new CouchmanError(`view "${name}" is missing map.js`);
    }
    const view = { map: await buildFn(mapPath) };

    const reducePath = path.join(viewDir, "reduce.js");
    const hasReduceFile = existsSync(reducePath);
    const builtinReduce = metaViews[name]?.reduce;
    if (hasReduceFile && builtinReduce !== undefined) {
      throw new CouchmanError(
        `view "${name}" has both reduce.js and a reduce in meta.json; choose one`,
      );
    }
    if (hasReduceFile) view.reduce = await buildFn(reducePath);
    else if (builtinReduce !== undefined) view.reduce = builtinReduce;

    views[name] = view;
  }
  return views;
}

/**
 * @param {string} dir
 * @param {Note} note
 * @param {(file: string) => Promise<string>} buildFn
 */
async function readIndexes(dir, note, buildFn) {
  /** @type {Record<string, any>} */
  const indexes = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = nfc(entry.name);
    if (isIgnored(name)) continue;
    if (!entry.isDirectory()) {
      throw new CouchmanError(
        `indexes/${name} must be a directory (an index is a folder with index.js)`,
      );
    }
    checkName(name, "index", note);

    const idxDir = path.join(dir, name);
    await assertOnly(idxDir, new Set(["index.js", "meta.json"]), `index "${name}"`);

    const idxPath = path.join(idxDir, "index.js");
    if (!existsSync(idxPath)) {
      throw new CouchmanError(`index "${name}" is missing index.js`);
    }
    // CouchDB/Clouseau search index: function lives in the "index" field.
    const index = { index: await buildFn(idxPath) };

    const metaPath = path.join(idxDir, "meta.json");
    if (existsSync(metaPath)) {
      const m = await readJson(metaPath);
      if (m.analyzer !== undefined) index.analyzer = m.analyzer;
      if (m.default_analyzer !== undefined) {
        index.default_analyzer = m.default_analyzer;
      }
    }

    indexes[name] = index;
  }
  return indexes;
}

/**
 * @param {string} dir
 * @param {string} kind  filters | updates | shows | lists
 * @param {Note} note
 * @param {(file: string) => Promise<string>} buildFn
 */
async function readFunctionDir(dir, kind, note, buildFn) {
  const singular = kind.slice(0, -1);
  /** @type {Record<string, string>} */
  const out = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = nfc(entry.name);
    if (isIgnored(name)) continue;
    if (entry.isDirectory()) {
      throw new CouchmanError(
        `${kind}/${name} must be a file (a ${singular} is one .js file)`,
      );
    }
    if (!name.endsWith(".js")) {
      throw new CouchmanError(
        `unknown extension for "${name}" in ${kind}/ (expected .js)`,
      );
    }
    const fnName = name.slice(0, -3);
    checkName(fnName, singular, note);
    out[fnName] = await buildFn(path.join(dir, name));
  }
  return out;
}

/**
 * Fail if `dir` contains any entry outside `allowed` (ignored entries excepted).
 * @param {string} dir
 * @param {Set<string>} allowed
 * @param {string} label
 */
async function assertOnly(dir, allowed, label) {
  for (const entry of await readdir(dir)) {
    const name = nfc(entry);
    if (isIgnored(name) || allowed.has(name)) continue;
    throw new CouchmanError(
      `unexpected "${name}" in ${label} (only ${[...allowed].join(", ")} allowed)`,
    );
  }
}
