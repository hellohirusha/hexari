import { describe, expect, it } from "vitest";
import { defaultBoard, vertices } from "../src/forge/board";
import {
  bankRate,
  newGame,
  transition,
  type Action,
} from "../src/forge/engine";
import { parseResumableGame } from "../src/forge/savedGame";
import {
  applyOnlineCommand,
  type OnlineCommand,
} from "../src/forge/online/session";

describe("retired Forge improvements", () => {
  it("rejects farm and market builds locally and online", () => {
    const game = transition(newGame(1), { type: "roll", total: 7 });
    const at = game.players[0].settlements[0];
    for (const building of ["farm", "market"]) {
      const action = { type: "build", building, at } as Action;
      expect(transition(game, action)).toBe(game);
      expect(
        applyOnlineCommand(
          { game, revision: 0, offer: null },
          0,
          0,
          action as OnlineCommand,
          2,
          () => [3, 4],
        ),
      ).toEqual({ ok: false, reason: "Invalid building." });
    }
  });

  it("loads a legacy save without applying farm production or market discounts", () => {
    const wheatCorner = vertices.find((corner) =>
      corner.tiles.some((tile) => defaultBoard[tile].resource === "wheat"),
    )!;
    const wheat = wheatCorner.tiles
      .map((tile) => defaultBoard[tile])
      .find((tile) => tile.resource === "wheat")!;
    const game = newGame(1);
    game.players[0].settlements = [wheatCorner.id];
    game.players[0].farms = [wheatCorner.id];
    game.players[1].settlements = [
      vertices.find(
        (vertex) =>
          vertex.id !== wheatCorner.id &&
          !wheatCorner.neighbors.includes(vertex.id),
      )!.id,
    ];
    game.players[1].markets = [game.players[1].settlements[0]];
    game.players[0].hand = { wood: 0, brick: 0, wheat: 0, ore: 0, sheep: 0 };
    game.progressed = true;
    const loaded = parseResumableGame(JSON.stringify(game));
    expect(loaded).not.toBeNull();
    const rolled = transition(loaded!, { type: "roll", total: wheat.number! });
    const adjacentMatches = wheatCorner.tiles.filter(
      (tile) =>
        defaultBoard[tile].resource === "wheat" &&
        defaultBoard[tile].number === wheat.number,
    ).length;
    expect(rolled.players[0].hand.wheat).toBe(adjacentMatches);
    expect(bankRate()).toBe(4);

    rolled.turn = 1;
    rolled.players[1].hand = { wood: 3, brick: 0, wheat: 0, ore: 0, sheep: 0 };
    expect(
      transition(rolled, { type: "bank", give: "wood", receive: "ore" }),
    ).toBe(rolled);
    rolled.players[1].hand.wood = 4;
    const traded = transition(rolled, {
      type: "bank",
      give: "wood",
      receive: "ore",
    });
    expect(traded.players[1].hand.wood).toBe(0);
    expect(traded.players[1].hand.ore).toBe(1);
  });
});
