import { describe, expect, it } from "vitest";
import { coachLimit, createCoachLimiter } from "../src/server/coachLimiter";

describe("coach per-process limits", () => {
  it("limits each visitor and resets the visitor window", () => {
    const limit = createCoachLimiter();
    expect(limit("a", 1000, 2, 10).allowed).toBe(true);
    expect(limit("a", 1001, 2, 10).allowed).toBe(true);
    expect(limit("a", 1002, 2, 10)).toEqual({ allowed: false, retryAfter: 60 });
    expect(limit("b", 1002, 2, 10).allowed).toBe(true);
    expect(limit("a", 61000, 2, 10).allowed).toBe(true);
  });
  it("caps all visitors per instance and validates settings", () => {
    const limit = createCoachLimiter();
    expect(limit("a", 1000, 10, 1).allowed).toBe(true);
    expect(limit("b", 1001, 10, 1).allowed).toBe(false);
    expect(limit("b", 3601000, 10, 1).allowed).toBe(true);
    expect(coachLimit("0", 15)).toBe(15);
    expect(coachLimit("20", 15)).toBe(20);
    expect(coachLimit("999999", 15)).toBe(15);
  });
});
