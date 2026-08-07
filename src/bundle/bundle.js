import * as esbuild from "esbuild";
import path from "node:path";
import { createRequire } from "node:module";
import { CouchmanError } from "../errors.js";
import { restrictImports } from "./resolve-plugin.js";
import { legacyInclude } from "./legacy-include.js";

// @babel/core and @babel/preset-env are CJS; load them through require for
// reliable interop.
const require = createRequire(import.meta.url);
const babel = require("@babel/core");
const presetEnv = require("@babel/preset-env");

/**
 * Lower a bundle to ES5. esbuild can only bundle/resolve and lower down to
 * roughly ES2015 — it refuses `const`, arrow functions, destructuring, spread,
 * `for…of`, classes and async at target "es5". Babel does the real ES5 work so
 * the query server's SpiderMonkey, however old, can run the output.
 *
 * @param {string} code   ES2015+ CJS bundle text from esbuild.
 * @param {string} target "es5", or a Babel targets object for a higher floor.
 * @returns {string}
 */
function toEs5(code, target) {
  const result = babel.transformSync(code, {
    configFile: false,
    babelrc: false,
    compact: false,
    comments: false,
    presets: [
      [
        presetEnv,
        {
          modules: false, // esbuild already emitted CJS; don't touch it
          targets: target === "es5" ? { ie: "11" } : target,
        },
      ],
    ],
  });
  if (!result || result.code == null) {
    throw new CouchmanError("ES5 transpilation produced no output");
  }
  return result.code;
}

/**
 * Wrap the CJS bundle so it evaluates to the module's default export.
 *
 * Two shapes (see README "Shared code"):
 *   - "iife" (default): `(function(){ …helpers…; return fn; })()` — a self-
 *     contained expression that evaluates to the function. The closure is built
 *     once.
 *   - "inline": a plain `function(){ …helpers…; return … }` literal, for query
 *     server builds that reject the IIFE-returns-function shape. Helpers live
 *     inside the function body and are re-evaluated per call.
 *
 * @param {string} bundle  ES5 CJS bundle text.
 * @param {"iife"|"inline"} wrap
 */
function wrapBundle(bundle, wrap) {
  const body =
    "var module = { exports: {} }, exports = module.exports;\n" +
    bundle +
    "\nvar __default = module.exports.default || module.exports;";

  if (wrap === "inline") {
    return (
      "function () {\n" +
      body +
      "\nreturn __default.apply(this, arguments);\n}"
    );
  }
  return "(function () {\n" + body + "\nreturn __default;\n})()";
}

/**
 * Detect an import cycle in the bundle's input graph. esbuild will happily
 * bundle cycles, but a cyclic dependency between query-server helpers is almost
 * always a mistake, so we surface it as an error.
 *
 * @param {import("esbuild").Metafile} metafile
 */
function detectCycles(metafile) {
  const graph = new Map();
  for (const [file, meta] of Object.entries(metafile.inputs)) {
    graph.set(
      file,
      meta.imports.filter((i) => i.original !== undefined || i.path).map((i) => i.path),
    );
  }

  const WHITE = 0,
    GREY = 1,
    BLACK = 2;
  const state = new Map();
  const stack = [];

  /** @param {string} node */
  function visit(node) {
    state.set(node, GREY);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const s = state.get(next) ?? WHITE;
      if (s === GREY) {
        const cycle = stack.slice(stack.indexOf(next)).concat(next);
        throw new CouchmanError(`import cycle detected: ${cycle.join(" → ")}`);
      }
      if (s === WHITE) visit(next);
    }
    stack.pop();
    state.set(node, BLACK);
  }

  for (const node of graph.keys()) {
    if ((state.get(node) ?? WHITE) === WHITE) visit(node);
  }
}

/**
 * Translate an esbuild build failure into a CouchmanError that points at the
 * user's source file (esbuild errors carry the original location).
 *
 * @param {import("esbuild").Message[]} errors
 */
function formatBuildErrors(errors) {
  const lines = errors.map((e) => {
    const loc = e.location
      ? ` (${e.location.file}:${e.location.line}:${e.location.column})`
      : "";
    return `${e.text}${loc}`;
  });
  return new CouchmanError(lines.join("\n"));
}

/**
 * Bundle a single query-server function file into a self-contained ES5
 * expression string. Imports are restricted to `_lib/` and `shared/`.
 *
 * @param {object} args
 * @param {string} args.entryFile  Absolute path to the function source.
 * @param {string} args.treeRoot   Absolute path to the project tree root.
 * @param {"iife"|"inline"} [args.wrap]
 * @param {string} [args.target]   esbuild target (default "es5").
 * @param {(msg: string) => void} [args.onWarn]  Receives deprecation warnings.
 * @returns {Promise<string>}      The wrapped function expression.
 */
export async function bundleFunction({
  entryFile,
  treeRoot,
  wrap = "iife",
  target = "es5",
  onWarn = () => {},
}) {
  let result;
  try {
    result = await esbuild.build({
      entryPoints: [entryFile],
      bundle: true,
      write: false,
      format: "cjs", // resolve imports + emit CJS; Babel handles ES5 lowering
      platform: "neutral",
      sourcemap: false,
      metafile: true,
      logLevel: "silent",
      absWorkingDir: treeRoot,
      plugins: [legacyInclude(onWarn), restrictImports(path.resolve(treeRoot))],
    });
  } catch (err) {
    if (err && Array.isArray(err.errors)) throw formatBuildErrors(err.errors);
    throw err;
  }

  detectCycles(result.metafile);
  const es5 = toEs5(result.outputFiles[0].text, target);
  return wrapBundle(es5, wrap);
}
