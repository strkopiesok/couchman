import { COST, unifiedDiff } from "./diff.js";
import { color } from "../logger.js";

const SYMBOL = { add: "+", change: "~", remove: "-" };
const LABEL = {
  [COST.VIEW]: "rebuild view",
  [COST.INDEX]: "FULL INDEX REBUILD",
  [COST.FREE]: "",
};
const FILE_WIDTH = 38;

function str(v) {
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

/**
 * Render a plan in the terse, Terraform-style form from the README. Under
 * `verbose`, each changed function is followed by a unified line diff.
 *
 * @param {import("./plan.js").DdocPlan extends any ? ReturnType<typeof import("./plan.js").buildPlan> : never} plan
 * @param {{ verbose?: boolean }} [opts]
 * @returns {string}
 */
export function formatPlan(plan, { verbose = false } = {}) {
  const lines = [];

  for (const d of plan.ddocs) {
    if (d.op === "noop") continue;

    if (d.op === "ignore") {
      lines.push(color.dim(`${d.db}/_design/${d.ddoc}  (ignored)`));
      continue;
    }

    lines.push(color.cyan(`${d.db}/_design/${d.ddoc}`));

    if (d.op === "delete") {
      lines.push(`  ${color.red("-")} _design/${d.ddoc}   DELETE (managed)`);
      lines.push("");
      continue;
    }

    for (const c of d.changes) {
      const label = LABEL[c.cost];
      const line = `  ${SYMBOL[c.op]} ${c.file.padEnd(FILE_WIDTH)}${label}`.trimEnd();
      lines.push(line);
      if (verbose && c.op === "change") {
        for (const dl of unifiedDiff(str(c.before), str(c.after))) {
          lines.push(`      ${dl}`);
        }
      }
    }
    lines.push("");
  }

  const s = plan.summary;
  const dbCount = plan.databases.length;
  const warn = s.warnings
    ? `, ${s.warnings} warning${s.warnings === 1 ? "" : "s"}`
    : "";
  lines.push(
    `${dbCount} database${dbCount === 1 ? "" : "s"}, ` +
      `+${s.create} ~${s.update} -${s.delete}${warn}`,
  );

  return lines.join("\n");
}
