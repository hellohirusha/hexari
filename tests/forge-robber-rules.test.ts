import { describe, expect, it } from "vitest";
import { defaultBoard, vertices } from "../src/forge/board";
import { goods, newGame, transition } from "../src/forge/engine";
import {
  applyOnlineCommand,
  type OnlineSession,
} from "../src/forge/online/session";

describe("Forge robber rules", () => {
  it("starts without cards and places the opening settlement and road without resource costs", () => {
    const start = newGame(0, { manualSetup: true });
    expect(start.robberTile).toBeUndefined();
    expect(
      start.players.every((player) =>
        goods.every((resource) => player.hand[resource] === 0),
      ),
    ).toBe(true);
    const settlement = transition(start, {
      type: "build",
      building: "settlement",
      at: 0,
      now: 1,
    });
    expect(settlement.players[0].settlements).toEqual([0]);
    const road = transition(settlement, {
      type: "build",
      building: "road",
      at: 0,
      to: vertices[0].neighbors[0],
      now: 2,
    });
    expect(road.players[0].roads).toHaveLength(1);
    expect(
      goods.every((resource) => road.players[0].hand[resource] === 0),
    ).toBe(true);
  });

  it("discards half only for hands of eight or more, then requires the robber to move", () => {
    const game = newGame(0);
    game.players[0].hand.wood = 9;
    game.players[1].hand.brick = 8;
    let next = transition(game, { type: "roll", total: 7 });
    expect(next.phase).toBe("discard");
    expect(next.discardRemaining).toEqual([4, 4]);
    expect(next.players.map((player) => ({ ...player.hand }))).toEqual(
      game.players.map((player) => player.hand),
    );
    expect(transition(next, { type: "moveRobber", tile: 0 })).toBe(next);
    for (let i = 0; i < 4; i++)
      next = transition(next, {
        type: "sevenDiscard",
        seat: 0,
        resource: "wood",
      });
    expect(next.phase).toBe("discard");
    for (let i = 0; i < 4; i++)
      next = transition(next, {
        type: "sevenDiscard",
        seat: 1,
        resource: "brick",
      });
    expect(next.phase).toBe("robber");
    expect(
      transition(next, {
        type: "moveRobber",
        tile: defaultBoard.findIndex((tile) => tile.resource === "desert"),
      }),
    ).toBe(next);
    expect(transition(next, { type: "endTurn", now: 4 })).toBe(next);
  });

  it("moves to another hex, steals a weighted random card from an adjacent opponent, and blocks production", () => {
    const game = newGame(0);
    game.players[1].settlements = [
      vertices.find((vertex) =>
        vertex.tiles.some((tile) => defaultBoard[tile].resource !== "desert"),
      )!.id,
    ];
    game.players[1].hand = { wood: 1, brick: 2, wheat: 0, ore: 0, sheep: 0 };
    const tile = vertices[game.players[1].settlements[0]].tiles.find(
      (id) => defaultBoard[id].resource !== "desert",
    )!;
    let next = transition(game, { type: "roll", total: 7 });
    expect(next.phase).toBe("robber");
    next = transition(next, { type: "moveRobber", tile, random: 0.99 });
    expect(next.phase).toBe("build");
    expect(next.players[0].hand.brick).toBe(1);
    expect(next.players[1].hand.brick).toBe(1);
    const testGame = {
      ...next,
      turn: 0 as const,
      phase: "roll" as const,
      dice: null,
    };
    testGame.players[0].settlements = [game.players[1].settlements[0]];
    const before = { ...testGame.players[0].hand };
    const produced = transition(testGame, {
      type: "roll",
      total: defaultBoard[tile].number!,
    });
    const resource = defaultBoard[tile].resource;
    if (resource === "desert") throw new Error("expected producing hex");
    const otherProduction = vertices[
      testGame.players[0].settlements[0]
    ].tiles.filter(
      (id) =>
        id !== tile &&
        defaultBoard[id].number === defaultBoard[tile].number &&
        defaultBoard[id].resource === resource,
    ).length;
    expect(produced.players[0].hand[resource]).toBe(
      before[resource] + otherProduction,
    );
  });

  it("allows each online player to discard only their own cards and only the roller to move", () => {
    const start: OnlineSession = { game: newGame(0), revision: 0, offer: null };
    start.game.players[1].hand.brick = 8;
    const rolled = applyOnlineCommand(start, 0, 0, { type: "roll" }, 1, () => [
      3, 4,
    ]);
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) return;
    expect(
      applyOnlineCommand(
        rolled.session,
        0,
        1,
        { type: "sevenDiscard", resource: "brick" },
        2,
        () => [1, 1],
      ).ok,
    ).toBe(false);
    let session = rolled.session;
    for (let i = 0; i < 4; i++) {
      const result = applyOnlineCommand(
        session,
        1,
        session.revision,
        { type: "sevenDiscard", resource: "brick" },
        3 + i,
        () => [1, 1],
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      session = result.session;
    }
    expect(
      applyOnlineCommand(
        session,
        1,
        session.revision,
        { type: "moveRobber", tile: 0 },
        8,
        () => [1, 1],
      ).ok,
    ).toBe(false);
    expect(
      applyOnlineCommand(
        session,
        0,
        session.revision,
        { type: "moveRobber", tile: 0 },
        8,
        () => [1, 1],
        () => 0,
      ).ok,
    ).toBe(true);
  });
});
