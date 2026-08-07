import { z } from "zod";

/**
 * One named environment. `url` may be absent in the config object (e.g. it
 * comes from `process.env.COUCHMAN_URL`, which can be unset); it is required
 * only when that environment is actually selected.
 */
export const environmentSchema = z.strictObject({
  url: z.url().optional(),
  protected: z.boolean().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
});

/** The full couchman.config.js shape. */
export const configSchema = z.strictObject({
  environments: z.record(z.string(), environmentSchema),
  databases: z.array(z.string()).min(1),
  target: z.string().default("es5"),
  wrap: z.enum(["iife", "inline"]).default("iife"),
});

/** @typedef {z.infer<typeof configSchema>} Config */

/**
 * Identity helper that gives editors type information and autocomplete for the
 * config object. Credentials live in the environment, never in the config file.
 *
 * @param {z.input<typeof configSchema>} config
 * @returns {z.input<typeof configSchema>}
 */
export function defineConfig(config) {
  return config;
}
