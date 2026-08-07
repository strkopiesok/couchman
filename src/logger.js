// Output discipline (see README "Output"):
//   - data goes to stdout, so it can be piped
//   - progress, warnings and errors go to stderr
//   - under --json, stdout carries only the machine-readable result
//   - under --verbose, extra detail is written to stderr

const useColor =
  process.stderr.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";

/**
 * @param {string} code SGR parameter, e.g. "31" for red
 * @param {string} s
 */
function paint(code, s) {
  return useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export const color = {
  red: (s) => paint("31", s),
  green: (s) => paint("32", s),
  yellow: (s) => paint("33", s),
  cyan: (s) => paint("36", s),
  dim: (s) => paint("2", s),
};

/**
 * @typedef {object} Logger
 * @property {boolean} json
 * @property {boolean} verbose
 * @property {(text?: string) => void} out    Data → stdout.
 * @property {(obj: unknown) => void} result  JSON result → stdout.
 * @property {(msg?: string) => void} info     Human progress → stderr (silent under --json).
 * @property {(msg?: string) => void} debug    Detail → stderr (only under --verbose).
 * @property {(msg: string) => void} warn      Warning → stderr.
 * @property {(msg: string) => void} error     Error → stderr.
 */

/**
 * @param {{ json?: boolean, verbose?: boolean }} [opts]
 * @returns {Logger}
 */
export function createLogger({ json = false, verbose = false } = {}) {
  return {
    json,
    verbose,
    out(text = "") {
      process.stdout.write(String(text) + "\n");
    },
    result(obj) {
      process.stdout.write(JSON.stringify(obj, null, json ? 0 : 2) + "\n");
    },
    info(msg = "") {
      if (!json) process.stderr.write(String(msg) + "\n");
    },
    debug(msg = "") {
      if (verbose && !json) process.stderr.write(color.dim(String(msg)) + "\n");
    },
    warn(msg) {
      process.stderr.write(color.yellow("warning: ") + String(msg) + "\n");
    },
    error(msg) {
      process.stderr.write(color.red("error: ") + String(msg) + "\n");
    },
  };
}
