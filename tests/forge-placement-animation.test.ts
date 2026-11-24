import { describe, expect, it } from "vitest";
import { newGame } from "../src/forge/engine";
import {
  newPlacementKeys,
  roadPlacementKey,
} from "../src/forge/placementAnimation";

describe("Forge placement animation", () => {
  it("animates only newly placed pieces and identifies roads in either direction", () => {
    const previous = newGame(0, { manualSetup: true });
    previous.players[0].roads.push([1, 2]);
    previous.players[0].settlements.push(3);
    const next = structuredClone(previous);
    next.players[0].roads = [
      [2, 1],
      [2, 4],
    ];
    next.players[1].settlements.push(5);
    expect(newPlacementKeys(previous, next)).toEqual(
      new Set([roadPlacementKey(0, 2, 4), "settlement:1:5"]),
    );
  });

  it("animates a city upgrade without animating the replaced settlement", () => {
    const previous = newGame(0, { manualSetup: true });
    previous.players[0].settlements.push(3);
    const next = structuredClone(previous);
    next.players[0].settlements = [];
    next.players[0].cities.push(3);
    expect(newPlacementKeys(previous, next)).toEqual(new Set(["city:0:3"]));
    expect(newPlacementKeys(next, next).size).toBe(0);
  });
});
