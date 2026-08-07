import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { configSchema } from "./schema.js";
import { CouchmanError } from "../errors.js";

const CONFIG_NAMES = ["couchman.config.js", "couchman.config.mjs"];

/**
 * @param {string} cwd
 * @returns {Promise<string|null>}  Absolute path to the config file, or null.
 */
export async function findConfig(cwd) {
  for (const name of CONFIG_NAMES) {
    const p = path.join(cwd, name);
    try {
      await access(p);
      return p;
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * @param {import("zod").ZodError} error
 * @returns {string}
 */
function formatZodError(error) {
  return error.issues
    .map((i) => {
      const where = i.path.length ? i.path.join(".") : "(root)";
      return `  ${where}: ${i.message}`;
    })
    .join("\n");
}

/**
 * Load and validate `couchman.config.js`. The config file is ESM, so it is
 * imported directly — no transform step. Validation fails fast with a message
 * that points at the offending field.
 *
 * @param {string} cwd
 * @returns {Promise<{ config: import("./schema.js").Config, file: string }>}
 */
export async function loadConfig(cwd) {
  const file = await findConfig(cwd);
  if (!file) {
    throw new CouchmanError(`no couchman.config.js found in ${cwd}`);
  }

  let mod;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (err) {
    throw new CouchmanError(
      `failed to load ${path.basename(file)}: ${err.message}`,
    );
  }

  if (mod.default == null) {
    throw new CouchmanError(
      `${path.basename(file)} must \`export default defineConfig({ ... })\``,
    );
  }

  const result = configSchema.safeParse(mod.default);
  if (!result.success) {
    throw new CouchmanError(
      `invalid ${path.basename(file)}:\n${formatZodError(result.error)}`,
    );
  }
  if (Object.keys(result.data.environments).length === 0) {
    throw new CouchmanError(
      `${path.basename(file)}: at least one environment is required`,
    );
  }

  return { config: result.data, file };
}

/**
 * @typedef {object} ResolvedEnvironment
 * @property {string} name
 * @property {string} url        Base URL with any embedded credentials stripped.
 * @property {string|undefined} user
 * @property {string|undefined} password
 * @property {boolean} protected
 */

/**
 * Resolve the effective environment: pick it by name (or the only one, if there
 * is a single environment), require a URL, and merge credentials. Credentials
 * come from `COUCHMAN_USER`/`COUCHMAN_PASSWORD`, then the config, then the URL —
 * in that order of precedence.
 *
 * @param {import("./schema.js").Config} config
 * @param {string} [envName]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {ResolvedEnvironment}
 */
export function resolveEnvironment(config, envName, env = process.env) {
  const names = Object.keys(config.environments);

  if (!envName) {
    if (names.length === 1) {
      envName = names[0];
    } else {
      throw new CouchmanError(
        `--env is required (environments: ${names.join(", ")})`,
      );
    }
  }

  const environment = config.environments[envName];
  if (!environment) {
    throw new CouchmanError(
      `unknown environment "${envName}" (have: ${names.join(", ")})`,
    );
  }
  if (!environment.url) {
    throw new CouchmanError(
      `environment "${envName}" has no url (is COUCHMAN_URL set?)`,
    );
  }

  const u = new URL(environment.url);
  const urlUser = u.username ? decodeURIComponent(u.username) : undefined;
  const urlPass = u.password ? decodeURIComponent(u.password) : undefined;
  u.username = "";
  u.password = "";

  return {
    name: envName,
    url: u.toString(),
    user: env.COUCHMAN_USER ?? environment.user ?? urlUser,
    password: env.COUCHMAN_PASSWORD ?? environment.password ?? urlPass,
    protected: environment.protected ?? false,
  };
}
