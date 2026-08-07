import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { debounce } from "../src/watch/debounce.js";

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces a burst into a single trailing call", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d();
    d();
    d();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes the latest arguments", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d("a");
    d("b");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("can be cancelled", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    d.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });
});
