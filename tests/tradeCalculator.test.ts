import { describe, expect, it } from "vitest";
import { defaultBoard, ports } from "../src/shared/board";
import { emptyHand } from "../src/shared/resources";
import {
  evaluateTrade,
  getBankRates,
  personalProduction,
} from "../src/hexari/engine/tradeCalculator";

describe("trade calculator", () => {
  it("finds whole-card comparable ranges for mixed offers with other cards fixed", () => {
    const hand = { wood: 20, brick: 20, wheat: 0, ore: 0, sheep: 0 };
    const base = {
      board: defaultBoard,
      hand,
      settlements: [],
      cities: [],
      goal: "balanced" as const,
      bankRates: getBankRates([], [], 4),
      receive: { ...emptyHand(), wheat: 2 },
    };
    const offer = { ...emptyHand(), wood: 2, brick: 1 };
    const result = evaluateTrade({ ...base, give: offer });
    expect(result.fairRanges).toHaveLength(2);
    for (const range of result.fairRanges) {
      for (let count = 0; count <= 12; count++) {
        const sample = evaluateTrade({
          ...base,
          give: { ...offer, [range.resource]: count },
        });
        const mathematicallyClose =
          sample.givenValue >= result.receivedValue * 0.8 - 1e-9 &&
          sample.givenValue <= result.receivedValue * 1.2 + 1e-9;
        expect(count >= range.min && count <= range.max).toBe(
          mathematicallyClose,
        );
      }
    }
  });
  it("requires a positive amount for a single-resource offer", () => {
    const result = evaluateTrade({
      board: defaultBoard,
      hand: { ...emptyHand(), wood: 1 },
      give: { ...emptyHand(), wood: 1 },
      receive: { ...emptyHand(), brick: 1 },
      settlements: [],
      cities: [],
      goal: "balanced",
      bankRates: getBankRates([], [], 4),
    });
    expect(result.fairRanges).toHaveLength(1);
    expect(result.fairRanges[0].min).toBeGreaterThanOrEqual(1);
  });
  it("counts city production twice and detects accessible ports", () => {
    const settlement = personalProduction(defaultBoard, [0], []);
    const city = personalProduction(defaultBoard, [], [0]);
    expect(city.wood).toBeCloseTo(settlement.wood * 2);
    expect(city.brick).toBeCloseTo(settlement.brick * 2);
    const port = ports[0];
    const rates = getBankRates(ports, [port.vertex], 4);
    expect(port.resource === "any" ? rates.wood : rates[port.resource]).toBe(
      port.rate,
    );
  });
  it("rejects trades beyond the hand and detects matching bank trades", () => {
    const hand = { ...emptyHand(), wood: 4 };
    const base = {
      board: defaultBoard,
      hand,
      settlements: [],
      cities: [],
      goal: "city" as const,
      bankRates: getBankRates([], [], 4),
    };
    const good = evaluateTrade({
      ...base,
      give: { ...emptyHand(), wood: 4 },
      receive: { ...emptyHand(), ore: 1 },
    });
    expect(good.ready).toBe(true);
    expect(good.bankCanMatch).toBe(true);
    expect(good.bankEquivalent).toEqual({ resource: "wood", cards: 4 });
    expect(good.deficitAfter).toBe(4);
    const invalid = evaluateTrade({
      ...base,
      give: { ...emptyHand(), wood: 5 },
      receive: { ...emptyHand(), ore: 1 },
    });
    expect(invalid.invalid).toBe(true);
    expect(invalid.ready).toBe(false);
  });
  it("uses a specific port to calculate the bank cost", () => {
    const result = evaluateTrade({
      board: defaultBoard,
      hand: { ...emptyHand(), wood: 4 },
      give: { ...emptyHand(), wood: 2 },
      receive: { ...emptyHand(), ore: 1 },
      settlements: [],
      cities: [],
      goal: "city",
      bankRates: getBankRates([], [], 4, "wood"),
    });
    expect(result.bankEquivalent).toEqual({ resource: "wood", cards: 2 });
    expect(result.bankCanMatch).toBe(true);
  });
  it("does not allow a bank exchange into the same resource", () => {
    const hand = { ...emptyHand(), wood: 4 };
    const result = evaluateTrade({
      board: defaultBoard,
      hand,
      give: hand,
      receive: { ...emptyHand(), wood: 1 },
      settlements: [],
      cities: [],
      goal: "balanced",
      bankRates: getBankRates([], [], 4),
    });
    expect(result.invalid).toBe(true);
    expect(result.bankCanMatch).toBe(false);
  });
});
