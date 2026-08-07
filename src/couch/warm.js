/**
 * Warm views and search indexes so the first real user does not pay for the
 * build. Views are queried with `limit=0`; search indexes with `q=*:*&limit=0`.
 *
 * @param {{ warmView: Function, warmSearch: Function }} client
 * @param {{ viewTargets?: Array<{db,ddoc,view}>, searchTargets?: Array<{db,ddoc,index}> }} targets
 * @returns {Promise<{ views: number, indexes: number }>}
 */
export async function warmAll(client, { viewTargets = [], searchTargets = [] } = {}) {
  let views = 0;
  let indexes = 0;
  for (const t of viewTargets) {
    await client.warmView(t.db, t.ddoc, t.view);
    views++;
  }
  for (const t of searchTargets) {
    await client.warmSearch(t.db, t.ddoc, t.index);
    indexes++;
  }
  return { views, indexes };
}
