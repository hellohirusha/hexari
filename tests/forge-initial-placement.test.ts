import { describe, expect, it } from "vitest";
import {
  bestSetupSettlement,
  legalSetupSettlement,
  newGame,
  transition,
} from "../src/forge/engine";
import { playAutomatedTurn } from "../src/forge/bot";
import { parseResumableGame } from "../src/forge/savedGame";
import {
  applyOnlineCommand,
  timeoutOnlineTurn,
} from "../src/forge/online/session";

describe("player-selected starting settlements", () => {
  it("grants a least-held resource on seven without exceeding the hand cap", () => {
    const game = newGame(0);
    game.players[0].hand = { wood: 0, brick: 2, wheat: 1, ore: 1, sheep: 1 };
    game.players[1].hand = { wood: 3, brick: 1, wheat: 1, ore: 1, sheep: 1 };
    const rolled = transition(game, { type: "roll", total: 7 });
    expect(rolled.players[0].hand.wood).toBe(1);
    expect(rolled.players[1].hand).toEqual(game.players[1].hand);
    expect(rolled.players[0].hand.brick).toBe(2);
  });
  it("reports seeded automated games from manual placements", () => {
    const turns: number[] = [];
    let unfinished = 0;
    for (let seed = 1; seed <= 20; seed++) {
      let state = newGame(0, { manualSetup: true });
      let random = seed;
      let count = 0;
      while (count < 1200 && state.phase !== "end") {
        const die = () => {
          random = (random * 16807) % 2147483647;
          return (random % 6) + 1;
        };
        state = playAutomatedTurn(state, die() + die(), ++count * 1000).game;
      }
      if (state.phase === "end") turns.push(count - 2);
      else unfinished++;
    }
    console.info("Manual placement study", { unfinished, turns });
    expect(unfinished).toBe(0);
  }, 30000);
  it("requires both players to choose a legal starting location before rolls", () => {
    const initial = newGame(0, { manualSetup: true });
    expect(initial.players.map((player) => player.settlements)).toEqual([
      [],
      [],
    ]);
    expect(transition(initial, { type: "roll", total: 7 })).toBe(initial);
    const firstCorner = bestSetupSettlement(initial)!;
    const first = transition(initial, {
      type: "build",
      building: "settlement",
      at: firstCorner,
      now: 1,
    });
    expect(first.phase).toBe("setup");
    expect(first.turn).toBe(1);
    expect(first.players[0].hand).toEqual(initial.players[0].hand);
    expect(legalSetupSettlement(first, firstCorner)).toBe(false);
    expect(
      transition(first, {
        type: "build",
        building: "settlement",
        at: firstCorner,
        now: 2,
      }),
    ).toBe(first);
    expect(parseResumableGame(JSON.stringify(first))?.phase).toBe("setup");
    const secondCorner = bestSetupSettlement(first)!;
    const ready = transition(first, {
      type: "build",
      building: "settlement",
      at: secondCorner,
      now: 2,
    });
    expect(ready.phase).toBe("roll");
    expect(ready.turn).toBe(0);
    expect(ready.players.map((player) => player.settlements.length)).toEqual([
      1, 1,
    ]);
    expect(parseResumableGame(JSON.stringify(ready))?.phase).toBe("roll");
  });
  it("validates online seat ownership and advances timeout without rolling", () => {
    const game = newGame(0, { manualSetup: true });
    const session = { game, revision: 0, offer: null };
    const dice = () => [3, 4] as [number, number];
    expect(
      applyOnlineCommand(
        session,
        1,
        0,
        { type: "build", building: "settlement", at: 23 },
        1,
        dice,
      ).ok,
    ).toBe(false);
    const first = timeoutOnlineTurn(session, 120000, dice);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.session.game.turn).toBe(1);
    expect(first.dice).toBeUndefined();
    const second = timeoutOnlineTurn(first.session, 240000, dice);
    expect(second.ok && second.session.game.phase).toBe("roll");
  });
  it.each([17, 2026, 7831])(
    "automated players reach a winner from chosen starts with seed %i",
    (seed) => {
      let state = newGame(0, { manualSetup: true });
      let random = seed;
      for (let turn = 0; turn < 1200 && state.phase !== "end"; turn++) {
        const die = () => {
          random = (random * 16807) % 2147483647;
          return (random % 6) + 1;
        };
        state = playAutomatedTurn(state, die() + die(), (turn + 1) * 1000).game;
      }
      expect(state.phase).toBe("end");
      expect(state.winner === 0 || state.winner === 1).toBe(true);
    },
    30000,
  );
});
