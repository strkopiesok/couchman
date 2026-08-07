import { validate } from "./validate.js";
import { newCmd } from "./new.js";
import { plan } from "./plan.js";
import { push } from "./push.js";
import { warm } from "./warm.js";
import { info } from "./info.js";
import { promote } from "./promote.js";
import { pull } from "./pull.js";
import { fixturesPush } from "./fixtures.js";
import { watch } from "./watch.js";

/**
 * Register every subcommand and its option surface on the root program.
 *
 * @param {import("commander").Command} program
 */
export function registerCommands(program) {
  program
    .command("plan")
    .description("diff the tree against the database; writes nothing")
    .option("--db <name>", "limit to a single database")
    .option("--ddoc <name>", "limit to a single design document")
    .action(plan);

  program
    .command("push")
    .description("apply the plan (insert / update / delete)")
    .option("--yes", "skip the confirmation prompt")
    .option("--prune", "delete managed design documents no longer in the tree")
    .option("--as <name>", "push the tree under an alternate design-document name")
    .option("--create-db", "create the database if it does not exist")
    .action(push);

  program
    .command("pull")
    .description("adopt an existing database into a tree (one-way)")
    .requiredOption("--db <name>", "database to pull")
    .option("--out <dir>", "output directory")
    .action(pull);

  program
    .command("validate")
    .description("offline check: parse, bundle, target check (no database)")
    .action(validate);

  program
    .command("warm")
    .description("build views and search indexes")
    .option("--views", "warm views only")
    .option("--indexes", "warm search indexes only")
    .option("--db <name>", "limit to a single database")
    .option("--ddoc <name>", "limit to a single design document")
    .action(warm);

  program
    .command("info")
    .description("report index sizes and build status")
    .option("--db <name>", "limit to a single database")
    .option("--ddoc <name>", "limit to a single design document")
    .action(info);

  program
    .command("watch")
    .description("push on change (300 ms debounce)")
    .action(watch);

  program
    .command("promote")
    .description("switch a design-document alias")
    .argument("<from>", "current design-document name")
    .argument("<to>", "alias to point at it")
    .option("--db <name>", "limit to a single database")
    .action(promote);

  const fixtures = program
    .command("fixtures")
    .description("manage seed documents");
  fixtures
    .command("push")
    .description("upsert seed documents by _id")
    .option("--db <name>", "limit to a single database")
    .action(fixturesPush);

  program
    .command("new")
    .description("scaffold a new view or index")
    .argument("<kind>", "view | index")
    .argument("<path>", "db/ddoc/name")
    .action(newCmd);
}
