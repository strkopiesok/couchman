import { readFile } from "node:fs/promises";
import path from "node:path";
import { CouchmanError } from "../errors.js";

const DIRECTIVE = /^[ \t]*\/\/INCLUDE:(.+?):DONE[ \t]*$/gm;

/**
 * Recursively expand legacy `//INCLUDE:file:DONE` directives by splicing in the
 * referenced file's contents (relative to the including file), guarding against
 * cycles.
 *
 * @param {string} text
 * @param {string} dir
 * @param {(msg: string) => void} onWarn
 * @param {Set<string>} seen
 * @param {string} origin  The file being processed (for messages).
 */
async function expand(text, dir, onWarn, seen, origin) {
  const matches = [...text.matchAll(DIRECTIVE)];
  if (matches.length === 0) return text;

  let out = "";
  let last = 0;
  for (const m of matches) {
    out += text.slice(last, m.index);
    const rel = m[1].trim();
    const target = path.resolve(dir, rel);
    onWarn(
      `//INCLUDE: is deprecated — migrate "${rel}" to an ES import (in ${origin})`,
    );
    if (seen.has(target)) {
      throw new CouchmanError(`//INCLUDE cycle detected at "${rel}" (in ${origin})`);
    }
    let included;
    try {
      included = await readFile(target, "utf8");
    } catch {
      throw new CouchmanError(`//INCLUDE target not found: "${rel}" (in ${origin})`);
    }
    const expanded = await expand(
      included,
      path.dirname(target),
      onWarn,
      new Set([...seen, target]),
      target,
    );
    out += expanded;
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  return out;
}

/**
 * esbuild plugin that expands legacy `//INCLUDE:` directives before bundling,
 * warning once per directive. Files without the directive are left to esbuild's
 * default loader.
 *
 * @param {(msg: string) => void} [onWarn]
 */
export function legacyInclude(onWarn = () => {}) {
  return {
    name: "couchman-legacy-include",
    /** @param {import("esbuild").PluginBuild} build */
    setup(build) {
      build.onLoad({ filter: /\.js$/ }, async (args) => {
        const text = await readFile(args.path, "utf8");
        if (!text.includes("//INCLUDE:")) return null;
        const contents = await expand(
          text,
          path.dirname(args.path),
          onWarn,
          new Set([args.path]),
          args.path,
        );
        return { contents, loader: "js" };
      });
    },
  };
}
