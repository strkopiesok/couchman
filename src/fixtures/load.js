import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { CouchmanError } from "../errors.js";

/**
 * Load seed documents for a database from `fixtures/<db>/*.json`. Each file is
 * either a single document or an array of documents; every one must have `_id`.
 *
 * @param {string} fixturesDir  Absolute path to the `fixtures/` directory.
 * @param {string} db
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function loadFixtures(fixturesDir, db) {
  const dir = path.join(fixturesDir, db);
  if (!existsSync(dir)) return [];

  const docs = [];
  for (const entry of (await readdir(dir)).sort()) {
    if (!entry.endsWith(".json")) continue;
    const raw = await readFile(path.join(dir, entry), "utf8");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new CouchmanError(`invalid JSON in fixtures/${db}/${entry}: ${err.message}`);
    }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const doc of list) {
      if (!doc || typeof doc !== "object" || !doc._id) {
        throw new CouchmanError(`fixture in fixtures/${db}/${entry} is missing _id`);
      }
      docs.push(doc);
    }
  }
  return docs;
}
