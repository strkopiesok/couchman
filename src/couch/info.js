/**
 * Collect size and build status for each search index. A per-index failure is
 * captured rather than aborting the whole report.
 *
 * @param {{ searchInfo: (db: string, ddoc: string, index: string) => Promise<any> }} client
 * @param {{ searchTargets?: Array<{db,ddoc,index}> }} targets
 * @returns {Promise<{ indexes: Array<Record<string, any>> }>}
 */
export async function collectInfo(client, { searchTargets = [] } = {}) {
  const indexes = [];
  for (const t of searchTargets) {
    try {
      const raw = await client.searchInfo(t.db, t.ddoc, t.index);
      const si = raw.search_index ?? raw;
      indexes.push({
        ...t,
        diskSize: si.disk_size,
        docCount: si.doc_count,
        building:
          si.pending_seq != null && si.committed_seq != null
            ? si.pending_seq !== si.committed_seq
            : undefined,
      });
    } catch (err) {
      indexes.push({
        ...t,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { indexes };
}

/**
 * @param {number|undefined} n
 * @returns {string}
 */
export function humanBytes(n) {
  if (n == null) return "?";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v : v.toFixed(1)}${units[i]}`;
}
