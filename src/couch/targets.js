/**
 * @typedef {{ db: string, ddoc: string, doc: Record<string, any> }} DesiredDdoc
 */

/**
 * Every view in the desired design documents, as warm/query targets.
 * @param {DesiredDdoc[]} desired
 * @returns {Array<{ db: string, ddoc: string, view: string }>}
 */
export function viewTargets(desired) {
  const out = [];
  for (const d of desired) {
    for (const view of Object.keys(d.doc.views ?? {})) {
      out.push({ db: d.db, ddoc: d.ddoc, view });
    }
  }
  return out;
}

/**
 * Every Clouseau search index in the desired design documents.
 * @param {DesiredDdoc[]} desired
 * @returns {Array<{ db: string, ddoc: string, index: string }>}
 */
export function searchTargets(desired) {
  const out = [];
  for (const d of desired) {
    for (const index of Object.keys(d.doc.indexes ?? {})) {
      out.push({ db: d.db, ddoc: d.ddoc, index });
    }
  }
  return out;
}

/**
 * @param {DesiredDdoc[]} desired
 * @returns {boolean}
 */
export function hasSearchIndexes(desired) {
  return desired.some((d) => Object.keys(d.doc.indexes ?? {}).length > 0);
}
