import { describe, expect, it } from "vitest";
import {
  bestSetupSettlement,
  legalSetupSettlement,
  legalSetupRoad,
  newGame,
  remainingPieces,
  setupNeedsRoad,
  transition,
} from "../src/forge/engine";
import { playAutomatedTurn } from "../src/forge/bot";
import { vertices } from "../src/forge/board";
import { parseResumableGame } from "../src/forge/savedGame";
import {
  applyOnlineCommand,
  timeoutOnlineTurn,
} from "../src/forge/online/session";

describe("player-selected starting settlements", () => {
  it("starts the robber phase without producing resources on seven", () => {
    const game = newGame(0);
    game.players[0].hand = { wood: 0, brick: 2, wheat: 1, ore: 1, sheep: 1 };
    game.players[1].hand = { wood: 3, brick: 1, wheat: 1, ore: 1, sheep: 1 };
    const rolled = transition(game, { type: "roll", total: 7 });
    expect(rolled.phase).toBe("robber");
    expect(rolled.players[0].hand).toEqual(game.players[0].hand);
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
    expect(first.turn).toBe(0);
    expect(setupNeedsRoad(first)).toBe(true);
    expect(first.players[0].hand).toEqual({
      wood: 0,
      brick: 0,
      wheat: 0,
      ore: 0,
      sheep: 0,
    });
    expect(remainingPieces(first.players[0], "settlement")).toBe(4);
    expect(legalSetupSettlement(first, firstCorner)).toBe(false);
    expect(
      transition(first, {
        type: "build",
        building: "settlement",
        at: firstCorner,
        now: 2,
      }),
    ).toBe(first);
    expect(transition(first, { type: "roll", total: 7 })).toBe(first);
    expect(
      transition(first, {
        type: "build",
        building: "road",
        at: 0,
        to: 53,
        now: 2,
      }),
    ).toBe(first);
    const firstTo = vertices[firstCorner].neighbors[0];
    expect(legalSetupRoad(first, firstCorner, firstTo)).toBe(true);
    const afterRoad = transition(first, {
      type: "build",
      building: "road",
      at: firstCorner,
      to: firstTo,
      now: 2,
    });
    expect(afterRoad.turn).toBe(1);
    expect(afterRoad.players[0].hand).toEqual(first.players[0].hand);
    expect(remainingPieces(afterRoad.players[0], "road")).toBe(14);
    expect(parseResumableGame(JSON.stringify(afterRoad))?.phase).toBe("setup");
    const secondCorner = bestSetupSettlement(afterRoad)!;
    const second = transition(afterRoad, {
      type: "build",
      building: "settlement",
      at: secondCorner,
      now: 3,
    });
    expect(second.turn).toBe(1);
    const secondTo = vertices[secondCorner].neighbors.find((id) =>
      legalSetupRoad(second, secondCorner, id),
    )!;
    const ready = transition(second, {
      type: "build",
      building: "road",
      at: secondCorner,
      to: secondTo,
      now: 4,
    });
    expect(ready.phase).toBe("roll");
    expect(ready.turn).toBe(0);
    expect(ready.players.map((player) => player.settlements.length)).toEqual([
      1, 1,
    ]);
    expect(ready.players[1].hand).toEqual({
      wood: 0,
      brick: 0,
      wheat: 0,
      ore: 0,
      sheep: 0,
    });
    expect(remainingPieces(ready.players[1], "road")).toBe(14);
    expect(parseResumableGame(JSON.stringify(ready))?.phase).toBe("roll");
  });
  it("allows a starting settlement without spending resources", () => {
    const game = newGame(0, { manualSetup: true });
    game.players[0].hand.wood = 0;
    const at = bestSetupSettlement(game)!;
    const placed = transition(game, {
      type: "build",
      building: "settlement",
      at,
    });
    expect(placed.players[0].settlements).toContain(at);
    expect(placed.players[0].hand).toEqual(game.players[0].hand);
    expect(remainingPieces(placed.players[0], "settlement")).toBe(4);
  });
  it("validates online seat ownership and waits for the player after a setup timeout", () => {
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
    expect(first.session.game.turn).toBe(0);
    expect(
      first.session.game.players.map((player) => player.settlements),
    ).toEqual([[], []]);
    expect(first.dice).toBeUndefined();
    const second = timeoutOnlineTurn(first.session, 240000, dice);
    expect(second.ok && second.session.game.phase).toBe("setup");
  });
  it("validates each online starting road before advancing to the next player", () => {
    const initial = {
      game: newGame(0, { manualSetup: true }),
      revision: 0,
      offer: null,
    };
    const dice = () => [3, 4] as [number, number];
    const corner = bestSetupSettlement(initial.game)!;
    const placed = applyOnlineCommand(
      initial,
      0,
      0,
      { type: "build", building: "settlement", at: corner },
      1,
      dice,
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(
      applyOnlineCommand(placed.session, 0, 1, { type: "roll" }, 2, dice),
    ).toEqual({
      ok: false,
      reason: "Place your starting road first.",
    });
    expect(
      applyOnlineCommand(
        placed.session,
        1,
        1,
        {
          type: "build",
          building: "road",
          at: corner,
          to: vertices[corner].neighbors[0],
        },
        2,
        dice,
      ).ok,
    ).toBe(false);
    expect(
      applyOnlineCommand(
        placed.session,
        0,
        1,
        { type: "build", building: "road", at: 0, to: 53 },
        2,
        dice,
      ).ok,
    ).toBe(false);
    const road = applyOnlineCommand(
      placed.session,
      0,
      1,
      {
        type: "build",
        building: "road",
        at: corner,
        to: vertices[corner].neighbors[0],
      },
      2,
      dice,
    );
    expect(road.ok).toBe(true);
    if (!road.ok) return;
    expect(road.session.revision).toBe(2);
    expect(road.session.game.turn).toBe(1);
    expect(road.session.game.players[0].hand).toEqual(
      placed.session.game.players[0].hand,
    );
    expect(remainingPieces(road.session.game.players[0], "road")).toBe(14);
    expect(road.session.game.phase).toBe("setup");
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
