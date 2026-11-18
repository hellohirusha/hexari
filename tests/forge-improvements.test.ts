import { describe, expect, it } from "vitest";
import { defaultBoard, vertices } from "../src/shared/board";
import {
  bankRate,
  legalImprovement,
  newGame,
  transition,
} from "../src/forge/engine";
import { parseResumableGame } from "../src/forge/savedGame";

describe("Forge improvements", () => {
  it("builds a market, preserves it in saves, and enables 3:1 bank trades", () => {
    const game = newGame(1);
    game.phase = "build";
    game.dice = 6;
    game.players[0].hand = { wood: 3, brick: 1, wheat: 0, ore: 0, sheep: 1 };
    const start = game.players[0].settlements[0];
    const built = transition(game, {
      type: "build",
      building: "market",
      at: start,
      now: 2,
    });
    expect(built.players[0].markets).toEqual([start]);
    expect(bankRate(built.players[0])).toBe(3);
    expect(
      parseResumableGame(JSON.stringify(built))?.players[0].markets,
    ).toEqual([start]);
    built.turn = 0;
    built.phase = "build";
    built.players[0].hand.wood = 3;
    const traded = transition(built, {
      type: "bank",
      give: "wood",
      receive: "ore",
    });
    expect(traded.players[0].hand.wood).toBe(0);
    expect(traded.players[0].hand.ore).toBe(1);
  });

  it("limits improvements to owned buildings and awards a farm bonus on a matching wheat roll", () => {
    const corner = vertices.find((v) =>
      v.tiles.some((i) => defaultBoard[i].resource === "wheat"),
    )!;
    const wheat = corner.tiles
      .map((i) => defaultBoard[i])
      .find((t) => t.resource === "wheat")!;
    const game = newGame(1);
    game.players[0].settlements = [corner.id];
    game.phase = "build";
    game.dice = 5;
    game.players[0].hand = { wood: 1, brick: 1, wheat: 1, ore: 0, sheep: 0 };
    expect(legalImprovement(game, "farm", 41)).toBe(false);
    const built = transition(game, {
      type: "build",
      building: "farm",
      at: corner.id,
      now: 2,
    });
    expect(built.players[0].farms).toEqual([corner.id]);
    built.turn = 0;
    built.phase = "roll";
    built.players[0].hand = { wood: 0, brick: 0, wheat: 0, ore: 0, sheep: 0 };
    const rolled = transition(built, { type: "roll", total: wheat.number! });
    const adjacentMatches = corner.tiles.filter(
      (i) =>
        defaultBoard[i].resource === "wheat" &&
        defaultBoard[i].number === wheat.number,
    ).length;
    expect(rolled.players[0].hand.wheat).toBe(adjacentMatches + 1);
    expect(
      legalImprovement({ ...built, phase: "build" }, "market", corner.id),
    ).toBe(false);
  });
});
