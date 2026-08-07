/**
 * Process exit codes.
 *
 * `couchman` follows the Terraform-style convention:
 *   0 — success, nothing to do
 *   2 — success, changes are pending (useful for `plan` in CI)
 *   1 — error
 */
export const EXIT = Object.freeze({
  OK: 0,
  CHANGES: 2,
  ERROR: 1,
});

/**
 * An expected, user-facing error. Its message is printed to stderr without a
 * stack trace and the process exits with `exitCode` (1 by default).
 *
 * Throw this for anything the user did wrong or the environment can't satisfy.
 * Unexpected errors (bugs) are left to bubble up with their stack.
 */
export class CouchmanError extends Error {
  /**
   * @param {string} message
   * @param {{ exitCode?: number }} [opts]
   */
  constructor(message, { exitCode = EXIT.ERROR } = {}) {
    super(message);
    this.name = "CouchmanError";
    this.exitCode = exitCode;
  }
}
