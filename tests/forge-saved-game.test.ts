import { describe, expect, it } from "vitest";
import { bestSetupSettlement, newGame, transition } from "../src/forge/engine";
import { vertices } from "../src/forge/board";
import { parseResumableGame } from "../src/forge/savedGame";
import { applyTurnTimeout } from "../src/forge/turnTimeout";
import { playAutomatedTurn } from "../src/forge/bot";

describe("resumable Forge saves", () => {
  it("restores each stage of the opening settlement and road placement", () => {
    const initial = newGame(0, { manualSetup: true });
    expect(parseResumableGame(JSON.stringify(initial))).toBeNull();
    const firstCorner = bestSetupSettlement(initial)!;
    const firstSettlement = transition(initial, {
      type: "build",
      building: "settlement",
      at: firstCorner,
      now: 1,
    });
    expect(parseResumableGame(JSON.stringify(firstSettlement))).toEqual(
      firstSettlement,
    );
    const firstRoad = transition(firstSettlement, {
      type: "build",
      building: "road",
      at: firstCorner,
      to: vertices[firstCorner].neighbors[0],
      now: 2,
    });
    expect(firstRoad.turn).toBe(1);
    expect(parseResumableGame(JSON.stringify(firstRoad))).toEqual(firstRoad);
    const secondCorner = bestSetupSettlement(firstRoad)!;
    const secondSettlement = transition(firstRoad, {
      type: "build",
      building: "settlement",
      at: secondCorner,
      now: 3,
    });
    expect(parseResumableGame(JSON.stringify(secondSettlement))).toEqual(
      secondSettlement,
    );
  });

  it("recovers an older opening that advanced before placing a road", () => {
    const initial = newGame(0, { manualSetup: true });
    const firstCorner = bestSetupSettlement(initial)!;
    const oldSave = transition(initial, {
      type: "build",
      building: "settlement",
      at: firstCorner,
      now: 1,
    });
    oldSave.turn = 1;
    expect(parseResumableGame(JSON.stringify(oldSave))?.turn).toBe(0);
  });
  it("rejects saves from the previous board instead of remapping their positions", () => {
    const oldGame = transition(newGame(123), { type: "roll", total: 7 });
    delete oldGame.boardVersion;
    expect(parseResumableGame(JSON.stringify(oldGame))).toBeNull();
  });
  it("hides resume for absent, untouched, corrupt and completed games", () => {
    expect(parseResumableGame(null)).toBeNull();
    expect(parseResumableGame(JSON.stringify(newGame(123)))).toBeNull();
    expect(
      parseResumableGame('{"phase":"build","turn":0,"players":[]}'),
    ).toBeNull();
    const finished = { ...newGame(123), phase: "end", winner: 0 };
    expect(parseResumableGame(JSON.stringify(finished))).toBeNull();
  });
  it("hides untouched randomized starts but preserves them after play begins", () => {
    for (const value of [0, 0.35, 0.7, 0.95]) {
      const game = newGame(123, { randomStart: true, random: () => value });
      expect(parseResumableGame(JSON.stringify(game))).toBeNull();
      const rolled = transition(game, { type: "roll", total: 7 });
      expect(parseResumableGame(JSON.stringify(rolled))).toEqual(rolled);
    }
  });
  it("restores a game after a roll", () => {
    const game = transition(newGame(123), { type: "roll", total: 7 });
    expect(parseResumableGame(JSON.stringify(game))).toEqual(game);
  });
  it("retains progress in older saves that did not store the progress flag", () => {
    const game = transition(newGame(123), { type: "roll", total: 7 });
    delete game.progressed;
    expect(parseResumableGame(JSON.stringify(game))?.progressed).toBe(true);
  });
  it("recognizes untouched legacy starts and preserves progressed legacy games", () => {
    const legacy = newGame(0);
    legacy.players[0].settlements = [8];
    legacy.players[1].settlements = [41];
    expect(parseResumableGame(JSON.stringify(legacy))).toBeNull();
    const played = transition(legacy, { type: "roll", total: 7 });
    expect(parseResumableGame(JSON.stringify(played))).toEqual(played);
  });
  it("preserves legal games throughout an automated playthrough", () => {
    let game = newGame(0);
    for (let turn = 0; turn < 300 && game.phase !== "end"; turn++) {
      game = playAutomatedTurn(game, [5, 6, 8, 9, 10][turn % 5], turn + 1).game;
      if (game.phase !== "end")
        expect(parseResumableGame(JSON.stringify(game))).toEqual(game);
    }
  });
  it("does not create a resumable game or start the bot when an untouched timer expires", () => {
    const idle = applyTurnTimeout(newGame(0), 120_000);
    expect(idle.turn).toBe(0);
    expect(idle.progressed).not.toBe(true);
    expect(parseResumableGame(JSON.stringify(idle))).toBeNull();
    const idleAgain = applyTurnTimeout(idle, 240_000);
    expect(parseResumableGame(JSON.stringify(idleAgain))).toBeNull();
  });
  it("still advances the turn after a played game times out", () => {
    const played = transition(newGame(0), { type: "roll", total: 6 });
    const next = applyTurnTimeout(played, 120_000);
    expect(next.turn).toBe(1);
    expect(parseResumableGame(JSON.stringify(next))).toEqual(next);
  });
  it("rejects saves with impossible hands and board positions", () => {
    const invalidHands = transition(newGame(0), { type: "roll", total: 7 });
    invalidHands.players[0].hand.wood = -1;
    expect(parseResumableGame(JSON.stringify(invalidHands))).toBeNull();

    const duplicatedSettlement = transition(newGame(0), {
      type: "roll",
      total: 7,
    });
    duplicatedSettlement.players[1].settlements = [
      ...duplicatedSettlement.players[0].settlements,
    ];
    expect(parseResumableGame(JSON.stringify(duplicatedSettlement))).toBeNull();

    const disconnectedEdge = transition(newGame(0), { type: "roll", total: 7 });
    disconnectedEdge.players[0].roads = [[0, 41]];
    expect(parseResumableGame(JSON.stringify(disconnectedEdge))).toBeNull();
  });
});
