import { describe, it, expect } from "vitest";
import { CouchmanError, EXIT } from "../src/errors.js";

describe("CouchmanError", () => {
  it("defaults to the error exit code", () => {
    const e = new CouchmanError("boom");
    expect(e.exitCode).toBe(EXIT.ERROR);
    expect(e.name).toBe("CouchmanError");
    expect(e).toBeInstanceOf(Error);
  });

  it("accepts an explicit exit code", () => {
    const e = new CouchmanError("pending", { exitCode: EXIT.CHANGES });
    expect(e.exitCode).toBe(EXIT.CHANGES);
  });
});
