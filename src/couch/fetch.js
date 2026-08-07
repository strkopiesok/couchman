/**
 * Read the current design documents from the given databases, tagged with their
 * db and (marker-stripped) ddoc name. A database that does not exist contributes
 * nothing. Optionally filter to a single design document.
 *
 * @param {{ databaseExists: (db: string) => Promise<boolean>, listDesignDocs: (db: string) => Promise<Record<string, any>[]> }} client
 * @param {string[]} dbs
 * @param {string} [ddocFilter]
 * @returns {Promise<Array<{ db: string, ddoc: string, doc: Record<string, any> }>>}
 */
export async function fetchCurrent(client, dbs, ddocFilter) {
  const current = [];
  for (const db of dbs) {
    if (!(await client.databaseExists(db))) continue;
    for (const doc of await client.listDesignDocs(db)) {
      const ddoc = String(doc._id).replace(/^_design\//, "");
      if (ddocFilter && ddoc !== ddocFilter) continue;
      current.push({ db, ddoc, doc });
    }
  }
  return current;
}
