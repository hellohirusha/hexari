import { describe, expect, it } from "vitest";
import { newGame, transition } from "../src/forge/engine";
import { turnTimeRemaining } from "../src/forge/turnClock";

describe("Forge turn countdown", () => {
  it("stops at the actual instant the game ends", () => {
    const game = newGame(1_000);
    game.players[1].cities = [game.players[1].settlements[0]];
    game.players[1].settlements = [0, 1, 2];
    const finished = transition(game, { type: "endTurn", now: 43_400 });
    expect(finished.phase).toBe("end");
    expect(turnTimeRemaining(finished, 44_000)).toBe(78);
    expect(turnTimeRemaining(finished, 300_000)).toBe(78);
  });

  it("freezes after a winning city upgrade even when the clock keeps ticking", () => {
    const game = newGame(1_000);
    game.phase = "build";
    game.players[0].cities = [0];
    game.players[0].settlements = [5, 10];
    game.players[0].hand = { wood: 0, brick: 0, wheat: 2, ore: 3, sheep: 0 };
    const finished = transition(game, {
      type: "build",
      building: "city",
      at: 5,
      now: 33_900,
    });
    expect(finished.phase).toBe("end");
    expect(finished.winner).toBe(0);
    expect(turnTimeRemaining(finished, 34_000)).toBe(88);
    expect(turnTimeRemaining(finished, 300_000, 200_000)).toBe(88);
  });

  it("uses the pause instant and bounds the countdown", () => {
    const game = newGame(10_000);
    expect(turnTimeRemaining(game, 70_000, 32_500)).toBe(98);
    expect(turnTimeRemaining(game, 0)).toBe(120);
    expect(turnTimeRemaining(game, 200_000)).toBe(0);
  });
});
