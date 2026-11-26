import { describe, expect, it } from "vitest";
import { buildOptions } from "../src/forge/buildOptions";
import {
  legalRoad,
  legalSettlement,
  newGame,
  remainingPieces,
  transition,
} from "../src/forge/engine";
import { vertices } from "../src/forge/board";

describe("Forge piece supply", () => {
  it("returns the settlement piece when a city replaces it", () => {
    const game = newGame(0);
    game.phase = "build";
    game.players[0].hand = { wood: 0, brick: 0, wheat: 2, ore: 3, sheep: 0 };
    expect(remainingPieces(game.players[0], "settlement")).toBe(4);
    const next = transition(game, {
      type: "build",
      building: "city",
      at: game.players[0].settlements[0],
      now: 1,
    });
    expect(remainingPieces(next.players[0], "settlement")).toBe(5);
    expect(remainingPieces(next.players[0], "city")).toBe(3);
  });

  it("does not offer or build a city after all city pieces are used", () => {
    const game = newGame(0);
    game.phase = "build";
    game.players[0].cities = [0, 1, 2, 3];
    game.players[0].hand = { wood: 0, brick: 0, wheat: 2, ore: 3, sheep: 0 };
    expect(remainingPieces(game.players[0], "city")).toBe(0);
    expect(buildOptions(game, "city").available).toBe(false);
    expect(
      transition(game, {
        type: "build",
        building: "city",
        at: game.players[0].settlements[0],
        now: 1,
      }),
    ).toBe(game);
  });

  it("rejects roads and settlements after their supplies are exhausted", () => {
    const game = newGame(0);
    game.players[0].settlements = [0, 2, 4, 6, 8];
    game.players[0].roads = Array.from({ length: 15 }, () => [0, 1]);
    expect(remainingPieces(game.players[0], "settlement")).toBe(0);
    expect(remainingPieces(game.players[0], "road")).toBe(0);
    expect(legalSettlement(game, 10)).toBe(false);
    expect(legalRoad(game, 0, vertices[0].neighbors[0])).toBe(false);
  });
});
