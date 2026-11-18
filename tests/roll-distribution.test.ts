import { describe, expect, it } from "vitest";
import { rollDeviation } from "../src/hexari/engine/rollDistribution";

describe("dice history deviations", () => {
  it("flags unusual counts without calling them future predictions", () => {
    expect(rollDeviation([], 6)).toBeNull();
    expect(rollDeviation(Array(60).fill(2), 7)).toBe("low");
    expect(rollDeviation(Array(60).fill(2), 2)).toBe("high");
    expect(rollDeviation([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 7)).toBeNull();
  });
});
