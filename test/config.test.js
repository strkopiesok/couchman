import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadConfig, resolveEnvironment } from "../src/config/load.js";
import { CouchmanError } from "../src/errors.js";

const configDir = fileURLToPath(new URL("./fixtures/config", import.meta.url));

let tmp;
beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "couchman-config-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("loads a valid config and applies defaults", async () => {
    const { config } = await loadConfig(configDir);
    expect(config.databases).toEqual(["mydb"]);
    expect(config.target).toBe("es5"); // default
    expect(config.wrap).toBe("iife"); // default
    expect(Object.keys(config.environments)).toEqual(["local", "prod"]);
  });

  it("throws when no config file exists", async () => {
    await expect(loadConfig(tmp)).rejects.toThrow(/no couchman.config.js/);
  });

  it("fails fast with a field path on an invalid config", async () => {
    await writeFile(
      path.join(tmp, "couchman.config.js"),
      // missing `databases`, and an unknown key
      `export default { environments: { local: { url: "http://x:5984" } }, nope: 1 };`,
    );
    await expect(loadConfig(tmp)).rejects.toThrow(CouchmanError);
  });

  it("rejects a non-URL environment url", async () => {
    await writeFile(
      path.join(tmp, "couchman.config.js"),
      `export default { environments: { local: { url: "not a url" } }, databases: ["d"] };`,
    );
    await expect(loadConfig(tmp)).rejects.toThrow(/invalid couchman.config.js/);
  });
});

describe("resolveEnvironment", () => {
  const config = {
    environments: {
      local: { url: "http://127.0.0.1:5984" },
      prod: { url: "https://db.example.com", protected: true },
    },
    databases: ["mydb"],
    target: "es5",
    wrap: "iife",
  };

  it("requires --env when there is more than one environment", () => {
    expect(() => resolveEnvironment(config)).toThrow(/--env is required/);
  });

  it("resolves a named environment", () => {
    const env = resolveEnvironment(config, "prod", {});
    expect(env.name).toBe("prod");
    expect(env.url).toBe("https://db.example.com/");
    expect(env.protected).toBe(true);
  });

  it("defaults to the only environment when there is just one", () => {
    const single = { ...config, environments: { local: config.environments.local } };
    expect(resolveEnvironment(single, undefined, {}).name).toBe("local");
  });

  it("rejects an unknown environment", () => {
    expect(() => resolveEnvironment(config, "staging", {})).toThrow(
      /unknown environment "staging"/,
    );
  });

  it("takes credentials from env vars over the URL", () => {
    const cfg = {
      ...config,
      environments: { one: { url: "http://inurl:inpass@127.0.0.1:5984" } },
    };
    const env = resolveEnvironment(cfg, "one", {
      COUCHMAN_USER: "envuser",
      COUCHMAN_PASSWORD: "envpass",
    });
    expect(env.user).toBe("envuser");
    expect(env.password).toBe("envpass");
    // credentials are stripped from the URL
    expect(env.url).toBe("http://127.0.0.1:5984/");
  });

  it("falls back to URL credentials when env vars are absent", () => {
    const cfg = {
      ...config,
      environments: { one: { url: "http://u:p@127.0.0.1:5984" } },
    };
    const env = resolveEnvironment(cfg, "one", {});
    expect(env.user).toBe("u");
    expect(env.password).toBe("p");
  });

  it("errors when the selected environment has no url", () => {
    const cfg = { ...config, environments: { one: {} } };
    expect(() => resolveEnvironment(cfg, "one", {})).toThrow(/has no url/);
  });
});
