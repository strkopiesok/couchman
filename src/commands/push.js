import { createInterface } from "node:readline";
import { makeAction } from "../action.js";
import { EXIT } from "../errors.js";
import { runPush } from "../push/run.js";

/** Ask a question on stderr so stdout stays reserved for plan data. */
function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * @param {{ yes: boolean }} opts
 * @returns {import("../push/apply.js").Confirm}
 */
export function makeConfirm({ yes }) {
  return {
    async proceed(hasRebuild) {
      if (yes) return true;
      const q = hasRebuild
        ? "\nThis includes view/index REBUILDS. Apply? (y/N) "
        : "\nApply these changes? (y/N) ";
      return /^y(es)?$/i.test((await ask(q)).trim());
    },
    async typed(message, expected) {
      return (await ask(`\n${message}: `)).trim() === expected;
    },
  };
}

/**
 * `couchman push` — run the plan, show it, then apply after confirmation.
 */
export const push = makeAction(async (ctx) => {
  await runPush(ctx, { confirm: makeConfirm({ yes: ctx.opts.yes }) });
  return EXIT.OK;
});
