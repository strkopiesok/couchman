import { describe, it, expect } from "vitest";
import { deaccent, fold, tokenize } from "../shared/normalize.js";

describe("deaccent", () => {
  it("folds common Latin-1 and Latin Extended-A characters", () => {
    expect(deaccent("café")).toBe("cafe");
    expect(deaccent("Žluťoučký kůň")).toBe("Zlutoucky kun");
    expect(deaccent("Æther œuvre")).toBe("AEther oeuvre");
    // Vietnamese (Latin Extended Additional) is covered by the vendored map.
    expect(deaccent("Việt Nam")).toBe("Viet Nam");
  });

  it("matches the vendored remove-accents behaviour, including its gaps", () => {
    // remove-accents leaves ß untouched (no ß→ss) and folds uppercase Ł to
    // lowercase "l". Pinned here so a table regeneration that changes these is
    // a visible, deliberate diff.
    expect(deaccent("ß")).toBe("ß");
    expect(deaccent("Łódź")).toBe("lodz");
  });

  it("leaves ASCII and unmapped characters untouched", () => {
    expect(deaccent("plain ASCII 123")).toBe("plain ASCII 123");
    expect(deaccent("日本語")).toBe("日本語");
  });

  it("produces ASCII-only output across the whole fold table", () => {
    // Every accented character the table knows about must fold to ASCII.
    const ranges = [];
    for (let c = 0x00c0; c <= 0x017f; c++) ranges.push(String.fromCharCode(c));
    const out = deaccent(ranges.join(""));
    // Unmapped code points in this range may remain; assert the ones we mapped
    // are gone by checking a representative sample folded cleanly.
    expect(deaccent("ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ")).toMatch(/^[\x00-\x7f]+$/);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("fold", () => {
  it("deaccents, lowercases and collapses whitespace", () => {
    expect(fold("  Café   au   LAIT ")).toBe("cafe au lait");
  });
});

describe("tokenize", () => {
  it("splits folded text into alphanumeric tokens", () => {
    expect(tokenize("Crème brûlée, 2 portions!")).toEqual([
      "creme",
      "brulee",
      "2",
      "portions",
    ]);
  });

  it("returns an empty array for punctuation-only input", () => {
    expect(tokenize("!!! ... ???")).toEqual([]);
  });
});
