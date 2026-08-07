/** The marker couchman writes into every design document it manages. */
export const MANAGED_KEY = "couchman";

/** Fields that are volatile or couchman-internal and must not affect the diff. */
const VOLATILE = new Set(["_rev", "_id", MANAGED_KEY]);

/**
 * Is this an existing design document that couchman created (and may therefore
 * update or delete)? Unmanaged documents are left alone.
 *
 * @param {Record<string, any>|null|undefined} doc
 * @returns {boolean}
 */
export function isManaged(doc) {
  return Boolean(doc && doc[MANAGED_KEY] && doc[MANAGED_KEY].managed === true);
}

/**
 * Strip volatile and marker fields so two design documents can be compared on
 * their meaningful content alone. `_rev` changes on every write and the marker
 * carries `pushed_at`/`git_sha`, so leaving either in would report changes where
 * there are none.
 *
 * @param {Record<string, any>} doc
 * @returns {Record<string, any>}
 */
export function stripForCompare(doc) {
  const out = {};
  for (const key of Object.keys(doc)) {
    if (!VOLATILE.has(key)) out[key] = doc[key];
  }
  return out;
}
