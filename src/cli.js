import { readFileSync } from "node:fs";
import { Command } from "commander";
import { registerCommands } from "./commands/index.js";

function readVersion() {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  return pkg.version;
}

/**
 * Build the root commander program with global flags and all subcommands.
 * Exported separately from `run` so tests can inspect the command surface.
 */
export function buildProgram() {
  const program = new Command();

  program
    .name("couchman")
    .description(
      "Manage CouchDB 3 design documents as files in your repository.",
    )
    .version(readVersion(), "-V, --version")
    // Global flags — available on every subcommand via optsWithGlobals().
    .option("--env <name>", "target environment from couchman.config.js")
    .option("--json", "machine-readable output on stdout")
    .option("--verbose", "extra detail on stderr")
    .option("--strict", "treat warnings as errors")
    .option("--continue-on-error", "keep going after per-item errors")
    .showHelpAfterError()
    // With no subcommand, print help and exit 0 rather than doing nothing.
    .action(() => {
      program.help();
    });

  registerCommands(program);
  return program;
}

/**
 * CLI entry point.
 * @param {string[]} argv  Full process argv (node, script, …args).
 */
export async function run(argv) {
  const program = buildProgram();
  await program.parseAsync(argv);
}
