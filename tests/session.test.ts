import { describe, expect, it } from "vitest";
import { emptyHand } from "../src/forge/engine";
import {
  applySessionEvent,
  type TrackedPlayer,
} from "../src/hexari/engine/session";

const players = (): TrackedPlayer[] => [
  { name: "A", corners: "1", hand: { ...emptyHand(), wood: 2, brick: 1 } },
  { name: "B", corners: "2", hand: { ...emptyHand(), ore: 1 } },
];
describe("session events", () => {
  it("subtracts the cost of a visible road", () => {
    const original = players();
    const result = applySessionEvent(original, {
      type: "build",
      player: 0,
      building: "road",
    });
    expect(result.players[0].hand).toMatchObject({ wood: 1, brick: 0 });
    expect(original[0].hand.wood).toBe(2);
  });
  it("moves known traded cards between players", () => {
    const result = applySessionEvent(players(), {
      type: "trade",
      player: 0,
      other: 1,
      give: "wood",
      receive: "ore",
    });
    expect(result.players[0].hand).toMatchObject({ wood: 1, ore: 1 });
    expect(result.players[1].hand).toMatchObject({ wood: 1, ore: 0 });
  });
  it("does not partially apply an unaffordable event", () => {
    const original = players();
    const result = applySessionEvent(original, {
      type: "build",
      player: 0,
      building: "city",
    });
    expect(result.error).toBeTruthy();
    expect(result.players).toBe(original);
  });
  it("rejects a steal from the same player", () => {
    expect(
      applySessionEvent(players(), {
        type: "steal",
        player: 0,
        other: 0,
        resource: "wood",
      }).error,
    ).toBeTruthy();
  });
  it("rejects invalid resource and building values without altering hands", () => {
    const original = players();
    const invalidSteal = applySessionEvent(original, {
      type: "steal",
      player: 0,
      other: 1,
      resource: "invalid" as never,
    });
    const invalidTrade = applySessionEvent(original, {
      type: "trade",
      player: 0,
      other: 1,
      give: "wood",
      receive: "invalid" as never,
    });
    const invalidBuild = applySessionEvent(original, {
      type: "build",
      player: 0,
      building: "invalid" as never,
    });
    const inheritedBuild = applySessionEvent(original, {
      type: "build",
      player: 0,
      building: "toString" as never,
    });
    const invalidPlayer = applySessionEvent(original, {
      type: "build",
      player: "0" as never,
      building: "road",
    });
    const invalidOther = applySessionEvent(original, {
      type: "steal",
      player: 0,
      other: "1" as never,
      resource: "ore",
    });
    for (const result of [
      invalidSteal,
      invalidTrade,
      invalidBuild,
      inheritedBuild,
      invalidPlayer,
      invalidOther,
    ]) {
      expect(result.error).toBeTruthy();
      expect(result.players).toBe(original);
    }
    expect(original[0].hand).toEqual({ ...emptyHand(), wood: 2, brick: 1 });
  });
});
