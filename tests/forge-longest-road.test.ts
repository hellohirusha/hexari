import { describe, expect, it } from "vitest";
import {
  legalRoad,
  longestRoadLength,
  longestRoadOwner,
  newGame,
  totalPoints,
  transition,
} from "../src/forge/engine";
import { playBotTurn } from "../src/forge/bot";
import { applyOnlineCommand } from "../src/forge/online/session";
import { parseResumableGame } from "../src/forge/savedGame";

describe("Forge longest road", () => {
  it("counts a continuous trail without double-counting branches or edges", () => {
    const game = newGame(0);
    const player = game.players[0];
    player.roads = [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
      [4, 5],
    ];
    game.players[1].settlements = [];
    expect(longestRoadLength(player, game.players[1])).toBe(4);
    player.roads = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [0, 4],
    ];
    expect(longestRoadLength(player, game.players[1])).toBe(5);
  });

  it("stops at an opposing building and retains an incumbent on ties", () => {
    const game = newGame(0);
    game.players[0].roads = [
      [23, 22],
      [22, 11],
      [11, 10],
      [10, 13],
      [13, 6],
    ];
    game.players[1].settlements = [11];
    expect(longestRoadLength(game.players[0], game.players[1])).toBe(3);
    game.players[1].settlements = [];
    game.players[0].settlements = [];
    game.players[1].roads = [
      [101, 102],
      [102, 103],
      [103, 104],
      [104, 105],
      [105, 106],
    ];
    expect(longestRoadOwner(game)).toBeNull();
    game.longestRoad = 0;
    expect(longestRoadOwner(game)).toBe(0);
    game.players[1].roads.push([106, 107]);
    expect(longestRoadOwner(game)).toBe(1);
  });

  it("awards points and wins immediately when the fifth road is built", () => {
    const game = newGame(0);
    game.phase = "build";
    game.dice = 7;
    game.players[0].cities = [80];
    game.players[0].roads = [
      [23, 22],
      [22, 11],
      [11, 10],
      [10, 13],
    ];
    const next = transition(game, {
      type: "build",
      building: "road",
      at: 13,
      to: 6,
      now: 1,
    });
    expect(next.longestRoad).toBe(0);
    expect(totalPoints(next, 0)).toBe(5);
    expect(next.phase).toBe("end");
    expect(next.winner).toBe(0);
  });

  it("transfers the award when an opponent builds on and breaks the route", () => {
    const game = newGame(0);
    game.turn = 1;
    game.phase = "build";
    game.dice = 7;
    game.longestRoad = 0;
    game.players[0].roads = [
      [23, 22],
      [22, 11],
      [11, 10],
      [10, 13],
      [13, 6],
    ];
    game.players[1].roads = [
      [11, 12],
      [12, 7],
      [7, 8],
      [8, 1],
      [1, 0],
    ];
    expect(longestRoadOwner(game)).toBe(0);
    const next = transition(game, {
      type: "build",
      building: "settlement",
      at: 11,
      now: 1,
    });
    expect(next.players[1].settlements).toContain(11);
    expect(next.longestRoad).toBe(1);
    expect(totalPoints(next, 1)).toBe(4);
  });

  it("limits new roads to the available pieces", () => {
    const game = newGame(0);
    game.players[0].roads = Array.from({ length: 15 }, () => [1, 2]);
    expect(legalRoad(game, 23, 22)).toBe(false);
  });

  it("prioritizes a road that wins the game", () => {
    const game = newGame(0);
    game.turn = 1;
    game.phase = "build";
    game.dice = 7;
    game.players[0].settlements = [38];
    game.players[1].settlements = [23];
    game.players[1].cities = [80];
    game.players[1].roads = [
      [23, 22],
      [22, 11],
      [11, 10],
      [10, 13],
    ];
    const result = playBotTurn(game, 7, 1);
    expect(result.game.winner).toBe(1);
    expect(result.actions).toContain("Built a road");
  });

  it("propagates a winning road through the authoritative online protocol", () => {
    const game = newGame(0);
    game.phase = "build";
    game.dice = 7;
    game.players[0].cities = [80];
    game.players[0].roads = [
      [23, 22],
      [22, 11],
      [11, 10],
      [10, 13],
    ];
    const result = applyOnlineCommand(
      { game, revision: 0, offer: null },
      0,
      0,
      { type: "build", building: "road", at: 13, to: 6 },
      1,
      () => [3, 4],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.game.winner).toBe(0);
      expect(result.session.game.longestRoad).toBe(0);
      expect(result.session.game.phase).toBe("end");
    }
  });

  it("loads a pre-award saved game and awards its existing uncontested road", () => {
    const game = newGame(0);
    delete game.longestRoad;
    game.progressed = true;
    game.players[0].roads = [
      [23, 22],
      [22, 11],
      [11, 10],
      [10, 13],
      [13, 6],
    ];
    const restored = parseResumableGame(JSON.stringify(game));
    expect(restored).not.toBeNull();
    expect(longestRoadOwner(restored!)).toBe(0);
    expect(totalPoints(restored!, 0)).toBe(3);
  });
});
