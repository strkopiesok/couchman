import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * The current git SHA, or undefined if not in a git repo / git is unavailable.
 * @param {string} cwd
 * @returns {string|undefined}
 */
export function gitSha(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

/**
 * Build a marker factory. couchman writes this marker into every design
 * document it manages, so it can later tell its own documents apart from
 * hand-made ones and never delete something it did not create.
 *
 * `pushed_at` and `git_sha` are deliberately volatile — the plan strips the
 * whole marker before comparing, so they never cause phantom diffs.
 *
 * @param {{ cwd: string, sha?: string, now?: () => string }} opts
 * @returns {(ddoc: string, desired: { db: string, dir?: string }) => Record<string, any>}
 */
export function makeMarker({ cwd, sha = gitSha(cwd), now = () => new Date().toISOString() }) {
  return (ddoc, desired) => {
    const source = desired.dir
      ? path.relative(cwd, desired.dir)
      : `databases/${desired.db}/${ddoc}`;
    return {
      managed: true,
      source,
      pushed_at: now(),
      ...(sha ? { git_sha: sha } : {}),
    };
  };
}
