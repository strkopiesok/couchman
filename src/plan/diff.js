import { stripForCompare } from "./normalize.js";

// Change cost (see README "Change detection and the plan"):
//   view-rebuild  — a view map/reduce changed; the view rebuilds, usually cheap
//   index-rebuild — a search index function or analyzer changed; a FULL Lucene
//                   rebuild, which can take hours
//   free          — metadata, filters, updates, shows, lists, validate_doc_update
export const COST = {
  VIEW: "view-rebuild",
  INDEX: "index-rebuild",
  FREE: "free",
};

/** Groups whose entries are compound objects with named leaf fields. */
const COMPOUND = {
  views: { leaves: ["map", "reduce"], cost: COST.VIEW, file: leafFileView },
  indexes: {
    leaves: ["index", "analyzer", "default_analyzer"],
    cost: COST.INDEX,
    file: leafFileIndex,
  },
};

/** Groups whose entries are a single function string. */
const STRING_GROUPS = {
  filters: (n) => `filters/${n}.js`,
  updates: (n) => `updates/${n}.js`,
  shows: (n) => `shows/${n}.js`,
  lists: (n) => `lists/${n}.js`,
};

/** Top-level scalar fields and the file they map to. */
const SCALARS = {
  validate_doc_update: "validate_doc_update.js",
  rewrites: "rewrites.json",
  language: "meta.json",
  options: "meta.json",
  autoupdate: "meta.json",
};

function leafFileView(name, leaf) {
  return leaf === "reduce" ? `views/${name}/reduce.js` : `views/${name}/map.js`;
}
function leafFileIndex(name, leaf) {
  return leaf === "index" ? `indexes/${name}/index.js` : `indexes/${name}/meta.json`;
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * @typedef {object} Change
 * @property {string} file   Display path, e.g. "views/by_type/map.js".
 * @property {"add"|"change"|"remove"} op
 * @property {string} cost   One of COST.*
 * @property {any} [before]
 * @property {any} [after]
 */

/**
 * Diff a current design document against the desired one, returning per-artifact
 * changes with their rebuild cost.
 *
 * @param {Record<string, any>|null} currentDoc  From the database (or null if new).
 * @param {Record<string, any>} desiredDoc       Built from the tree.
 * @returns {{ changes: Change[], viewRebuild: boolean, indexRebuild: boolean }}
 */
export function diffDdoc(currentDoc, desiredDoc) {
  const cur = stripForCompare(currentDoc ?? {});
  const des = stripForCompare(desiredDoc);
  /** @type {Change[]} */
  const changes = [];

  for (const [group, spec] of Object.entries(COMPOUND)) {
    diffCompound(group, spec, cur[group] ?? {}, des[group] ?? {}, changes);
  }
  for (const [group, file] of Object.entries(STRING_GROUPS)) {
    diffStringMap(cur[group] ?? {}, des[group] ?? {}, file, changes);
  }
  for (const [key, file] of Object.entries(SCALARS)) {
    if (!eq(cur[key], des[key])) {
      changes.push(scalarChange(file, cur[key], des[key]));
    }
  }

  return {
    changes,
    viewRebuild: changes.some((c) => c.cost === COST.VIEW),
    indexRebuild: changes.some((c) => c.cost === COST.INDEX),
  };
}

function diffCompound(group, spec, cur, des, changes) {
  for (const name of union(cur, des)) {
    const c = cur[name];
    const d = des[name];
    if (c === undefined) {
      // whole artifact added — one line per present leaf file
      for (const leaf of spec.leaves) {
        if (d[leaf] !== undefined) {
          changes.push({ file: spec.file(name, leaf), op: "add", cost: spec.cost, after: d[leaf] });
        }
      }
      continue;
    }
    if (d === undefined) {
      for (const leaf of spec.leaves) {
        if (c[leaf] !== undefined) {
          changes.push({ file: spec.file(name, leaf), op: "remove", cost: spec.cost, before: c[leaf] });
        }
      }
      continue;
    }
    for (const leaf of spec.leaves) {
      if (eq(c[leaf], d[leaf])) continue;
      const op = c[leaf] === undefined ? "add" : d[leaf] === undefined ? "remove" : "change";
      changes.push({
        file: spec.file(name, leaf),
        op,
        cost: spec.cost,
        before: c[leaf],
        after: d[leaf],
      });
    }
  }
}

function diffStringMap(cur, des, file, changes) {
  for (const name of union(cur, des)) {
    if (cur[name] === undefined) {
      changes.push({ file: file(name), op: "add", cost: COST.FREE, after: des[name] });
    } else if (des[name] === undefined) {
      changes.push({ file: file(name), op: "remove", cost: COST.FREE, before: cur[name] });
    } else if (cur[name] !== des[name]) {
      changes.push({
        file: file(name),
        op: "change",
        cost: COST.FREE,
        before: cur[name],
        after: des[name],
      });
    }
  }
}

function scalarChange(file, before, after) {
  const op = before === undefined ? "add" : after === undefined ? "remove" : "change";
  return { file, op, cost: COST.FREE, before, after };
}

function union(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
}

/**
 * A minimal LCS-based unified line diff, used to render a change under
 * `--verbose`. Returns lines prefixed with " ", "-" or "+".
 *
 * @param {string} before
 * @param {string} after
 * @returns {string[]}
 */
export function unifiedDiff(before, after) {
  const a = String(before ?? "").split("\n");
  const b = String(after ?? "").split("\n");
  const n = a.length;
  const m = b.length;

  // LCS length table
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(` ${a[i]}`);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(`-${a[i++]}`);
    } else {
      out.push(`+${b[j++]}`);
    }
  }
  while (i < n) out.push(`-${a[i++]}`);
  while (j < m) out.push(`+${b[j++]}`);
  return out;
}
