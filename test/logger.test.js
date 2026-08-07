import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "../src/logger.js";

describe("logger", () => {
  let out, err;

  beforeEach(() => {
    out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    out.mockRestore();
    err.mockRestore();
  });

  it("routes data to stdout", () => {
    createLogger().out("hello");
    expect(out).toHaveBeenCalledWith("hello\n");
    expect(err).not.toHaveBeenCalled();
  });

  it("routes warnings and errors to stderr, never stdout", () => {
    const log = createLogger();
    log.warn("careful");
    log.error("boom");
    expect(err).toHaveBeenCalledTimes(2);
    expect(out).not.toHaveBeenCalled();
  });

  it("suppresses human progress under --json", () => {
    createLogger({ json: true }).info("progress");
    expect(err).not.toHaveBeenCalled();
  });

  it("gates debug output behind --verbose", () => {
    createLogger({ verbose: false }).debug("detail");
    expect(err).not.toHaveBeenCalled();

    createLogger({ verbose: true }).debug("detail");
    expect(err).toHaveBeenCalledOnce();
  });

  it("emits compact JSON for results under --json", () => {
    createLogger({ json: true }).result({ a: 1 });
    expect(out).toHaveBeenCalledWith('{"a":1}\n');
  });
});
