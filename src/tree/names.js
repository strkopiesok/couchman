// Path segments become design-document, view and index names. macOS returns
// filenames in NFD and Linux in NFC, so the same repository would otherwise
// produce different view names on a developer's machine and in CI. Normalise
// every segment to NFC before using it as a name. See README "Filenames".

/**
 * @param {string} s
 * @returns {string}
 */
export function nfc(s) {
  return s.normalize("NFC");
}

/**
 * Files and directories starting with `.` or `_` are ignored by the tree
 * walker — including `_lib`. `_lib` holds shared code that the *bundler* is
 * allowed to import from (see the resolve plugin), but it is never a design-doc
 * section or a design document itself, so assembly skips it like any other
 * underscore-prefixed entry.
 *
 * @param {string} name  An already-NFC path segment.
 * @returns {boolean}
 */
export function isIgnored(name) {
  return name.startsWith(".") || name.startsWith("_");
}

const VALID_NAME = /^[a-z0-9_]+$/;

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isValidName(name) {
  return VALID_NAME.test(name);
}

/**
 * Report a name outside `[a-z0-9_]` through `note`. The caller decides whether
 * `note` warns or throws (the latter under `--strict`).
 *
 * @param {string} name
 * @param {string} kind  e.g. "view", "index", "database"
 * @param {(msg: string) => void} note
 */
export function checkName(name, kind, note) {
  if (!isValidName(name)) {
    note(`${kind} name "${name}" contains characters outside [a-z0-9_]`);
  }
}
