import { describe, expect, it } from "vitest";
import { bundleTradeValue } from "../src/hexari/engine/analysis";
import { defaultBoard } from "../src/shared/board";
import { emptyHand } from "../src/forge/engine";

describe("multi-resource trade comparison", () => {
  it("combines credits from different resources", () => {
    const offer = { ...emptyHand(), wood: 4, brick: 4 };
    const requested = { ...emptyHand(), ore: 1, wheat: 1 };
    expect(
      bundleTradeValue(defaultBoard, offer, requested, 4).bankCanMatch,
    ).toBe(true);
  });
  it("does not count a bank exchange for the same resource", () => {
    const offer = { ...emptyHand(), wood: 4 };
    const requested = { ...emptyHand(), wood: 1 };
    expect(
      bundleTradeValue(defaultBoard, offer, requested, 4).bankCanMatch,
    ).toBe(false);
  });
  it("applies a specific port only to its matching resource", () => {
    const offer = { ...emptyHand(), wood: 2, brick: 2 };
    const requested = { ...emptyHand(), ore: 2 };
    const result = bundleTradeValue(defaultBoard, offer, requested, 4, "wood");
    expect(result.credits).toBe(1);
    expect(result.bankCanMatch).toBe(false);
  });
});
