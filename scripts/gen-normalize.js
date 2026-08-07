#!/usr/bin/env node
// Regenerates shared/normalize.js from the remove-accents character map.
//
// shared/normalize.js runs bundled inside the CouchDB query server, where
// String.prototype.normalize may not exist. remove-accents is map-based (no
// normalize), so we vendor its table as data — no runtime dependency reaches
// the query server. We reconstruct the map over the Basic Multilingual Plane so
// every key is a single UTF-16 code unit, safe for charAt on old SpiderMonkey.
//
// Usage: node scripts/gen-normalize.js
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const removeAccents = require("remove-accents");
const { version } = require("remove-accents/package.json");

const pairs = [];
for (let c = 0; c <= 0xffff; c++) {
  const ch = String.fromCharCode(c);
  const out = removeAccents(ch);
  if (out !== ch) pairs.push([ch, out]);
}

const mapLines = pairs
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
  .join("\n");

const file = `// Ships with couchman and is meant to be used, not just read (see README
// "Diacritics in your data"). It runs bundled inside the CouchDB query server,
// so it must never rely on String.prototype.normalize (absent on older
// SpiderMonkey builds) — it folds via a static lookup table instead.
//
// The FOLD table is vendored from remove-accents@${version} (MIT), which is
// map-based and does not use String.prototype.normalize. Reconstructed over the
// Basic Multilingual Plane so every key is a single UTF-16 code unit, safe for
// charAt. Regenerate with scripts/gen-normalize.js; do not edit by hand.

/** @type {Object<string,string>} accented character → ASCII fold */
var FOLD = {
${mapLines}
};

/**
 * Fold accented characters to ASCII using a static lookup table. Characters not
 * in the table are passed through unchanged.
 *
 * @param {string} s
 * @returns {string}
 */
export function deaccent(s) {
  var out = "";
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    out += FOLD[ch] || ch;
  }
  return out;
}

/**
 * deaccent + lowercase + whitespace collapse. Good for a case/accent-insensitive
 * sort or match key.
 *
 * @param {string} s
 * @returns {string}
 */
export function fold(s) {
  return deaccent(s).toLowerCase().replace(/\\s+/g, " ").replace(/^ | $/g, "");
}

/**
 * Split text into lowercase, accent-folded alphanumeric tokens for indexing.
 *
 * @param {string} s
 * @returns {string[]}
 */
export function tokenize(s) {
  var parts = fold(s).split(/[^a-z0-9]+/);
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    if (parts[i]) out.push(parts[i]);
  }
  return out;
}
`;

const out = fileURLToPath(new URL("../shared/normalize.js", import.meta.url));
writeFileSync(out, file);
console.log(`wrote shared/normalize.js — ${pairs.length} fold entries from remove-accents@${version}`);
