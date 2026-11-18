import { describe, expect, it } from "vitest";
import {
  initialBelief,
  unknownSteal,
  observeResource,
  applyKnownChange,
  beliefSummary,
} from "../src/hexari/engine/belief";
import { emptyHand } from "../src/forge/engine";

describe("unknown steal inference", () => {
  it("conditions on a visible spend and updates the possible hands", () => {
    const prior = initialBelief([
      emptyHand(),
      { ...emptyHand(), wood: 2, ore: 1 },
    ]);
    const afterSteal = unknownSteal(prior, 0, 1)!;
    const afterSpend = applyKnownChange(afterSteal, 1, "ore", -1)!;
    expect(beliefSummary(afterSpend, 0, "wood")).toEqual([
      { count: 1, probability: 1 },
    ]);
    expect(beliefSummary(afterSpend, 1, "ore")).toEqual([
      { count: 0, probability: 1 },
    ]);
  });
  it("weights outcomes by the victim's card counts", () => {
    const prior = initialBelief([
      emptyHand(),
      { ...emptyHand(), wood: 2, ore: 1 },
    ]);
    const posterior = unknownSteal(prior, 0, 1)!;
    expect(beliefSummary(posterior, 0, "wood")).toEqual([
      { count: 0, probability: 1 / 3 },
      { count: 1, probability: 2 / 3 },
    ]);
    expect(
      posterior.reduce((sum, world) => sum + world.probability, 0),
    ).toBeCloseTo(1);
  });
  it("conditions on new evidence and eliminates impossible hands", () => {
    const prior = initialBelief([
      emptyHand(),
      { ...emptyHand(), wood: 2, ore: 1 },
    ]);
    const posterior = unknownSteal(prior, 0, 1)!;
    const observed = observeResource(posterior, 1, "ore")!;
    expect(beliefSummary(observed, 0, "wood")).toEqual([
      { count: 1, probability: 1 },
    ]);
  });
  it("rejects impossible steals without changing the prior", () => {
    const prior = initialBelief([emptyHand(), emptyHand()]);
    expect(unknownSteal(prior, 0, 1)).toBeNull();
    expect(prior[0].hands[1]).toEqual(emptyHand());
  });
});
