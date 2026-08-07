import { readFile } from "node:fs/promises";
import { CouchmanError } from "../errors.js";

/**
 * Read a file as UTF-8, strip a leading BOM, and normalise line endings to LF.
 *
 * Without this, a single commit from a Windows machine (CRLF, or a BOM) rewrites
 * every design document and the plan shows a hundred changes where there are
 * none. See README "Encoding and diacritics".
 *
 * @param {string} file
 * @returns {Promise<string>}
 */
export async function readText(file) {
  let s = await readFile(file, "utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // strip BOM
  return s.replace(/\r\n?/g, "\n"); // CRLF and lone CR → LF
}

/**
 * Read and parse a JSON file with the same normalisation as {@link readText}.
 * Parse errors are reported against the source path.
 *
 * @param {string} file
 * @returns {Promise<any>}
 */
export async function readJson(file) {
  const text = await readText(file);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new CouchmanError(`invalid JSON in ${file}: ${err.message}`);
  }
}
