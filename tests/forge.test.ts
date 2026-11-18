import { describe, expect, it } from "vitest";
import { pips } from "../src/shared/board";
import { defaultBoard, vertices } from "../src/forge/board";
import {
  goods,
  legalRoad,
  newGame,
  points,
  transition,
} from "../src/forge/engine";
import {
  production,
  tradeValue,
  yieldForRoll,
} from "../src/hexari/engine/analysis";
import { botAcceptsTrade } from "../src/forge/ForgeMarket";

describe("forge transitions", () => {
  it("starts both players with three resources and equal expected production", () => {
    const game = newGame();
    const starts = game.players.map(
      (player) => vertices[player.settlements[0]],
    );
    expect(starts[0].neighbors).not.toContain(starts[1].id);
    const values = starts.map((start) => ({
      resources: new Set(start.tiles.map((tile) => defaultBoard[tile].resource))
        .size,
      pips: start.tiles.reduce(
        (sum, tile) => sum + (pips[defaultBoard[tile].number ?? 0] ?? 0),
        0,
      ),
    }));
    expect(values).toEqual([
      { resources: 3, pips: 12 },
      { resources: 3, pips: 12 },
    ]);
  });
  it("starts with two players and one point each", () => {
    const g = newGame(1);
    expect(g.phase).toBe("roll");
    expect(g.players.map(points)).toEqual([1, 1]);
  });
  it("rejects building before a roll without mutating the state", () => {
    const g = newGame();
    const start = g.players[0].settlements[0];
    expect(transition(g, { type: "build", building: "city", at: start })).toBe(
      g,
    );
    expect(g.players[0].settlements).toEqual([start]);
  });
  it("rolls only once per turn", () => {
    const g = transition(newGame(), { type: "roll", total: 6 });
    expect(g.phase).toBe("build");
    expect(transition(g, { type: "roll", total: 6 })).toBe(g);
  });
  it("rejects invalid rolls", () => {
    const g = newGame();
    expect(transition(g, { type: "roll", total: 13 })).toBe(g);
  });
  it("switches turns and restores the roll phase", () => {
    const g = transition(newGame(), { type: "endTurn", now: 123 });
    expect(g.turn).toBe(1);
    expect(g.phase).toBe("roll");
    expect(g.turnStarted).toBe(123);
  });
  it("builds a connected road and charges its cost", () => {
    let g = transition(newGame(), { type: "roll", total: 7 });
    const start = g.players[0].settlements[0];
    const to = vertices[start].neighbors[0];
    expect(legalRoad(g, start, to)).toBe(true);
    g = transition(g, {
      type: "build",
      building: "road",
      at: start,
      to,
      now: 123,
    });
    expect(g.players[0].roads).toEqual([[start, to]]);
    expect(g.players[0].hand.wood).toBe(0);
    expect(g.players[0].hand.brick).toBe(0);
    expect(g.turn).toBe(1);
    expect(g.phase).toBe("roll");
    expect(g.turnStarted).toBe(123);
  });
  it("does not permit building an unconnected road", () => {
    const g = transition(newGame(), { type: "roll", total: 7 });
    expect(
      transition(g, {
        type: "build",
        building: "road",
        at: 40,
        to: vertices[40].neighbors[0],
      }),
    ).toBe(g);
  });
  it("passes the turn after a settlement or city, but not after an invalid build", () => {
    const game = transition(newGame(0), { type: "roll", total: 7 });
    const start = game.players[0].settlements[0];
    const roadEnd = vertices[start].neighbors[0];
    const nextCorner = vertices[roadEnd].neighbors.find((id) => id !== start)!;
    game.players[0].roads = [
      [start, roadEnd],
      [roadEnd, nextCorner],
    ];
    const settlement = transition(game, {
      type: "build",
      building: "settlement",
      at: nextCorner,
      now: 42,
    });
    expect(settlement.players[0].settlements).toContain(nextCorner);
    expect([settlement.turn, settlement.phase, settlement.turnStarted]).toEqual(
      [1, "roll", 42],
    );
    const cityGame = structuredClone(game);
    cityGame.players[0].hand.wheat = 2;
    cityGame.players[0].hand.ore = 3;
    const city = transition(cityGame, {
      type: "build",
      building: "city",
      at: start,
      now: 43,
    });
    expect(city.players[0].cities).toContain(start);
    expect([city.turn, city.phase, city.turnStarted]).toEqual([1, "roll", 43]);
    expect(
      transition(game, { type: "build", building: "city", at: start, now: 44 }),
    ).toBe(game);
  });
  it("caps production at seven cards", () => {
    const g = newGame();
    for (const x of goods) g.players[0].hand[x] = 0;
    g.players[0].hand.wood = 7;
    const n =
      defaultBoard[vertices[g.players[0].settlements[0]].tiles[0]].number ?? 7;
    const result = transition(g, { type: "roll", total: n });
    expect(goods.reduce((s, x) => s + result.players[0].hand[x], 0)).toBe(7);
  });
  it("does not allow a bank trade before rolling", () => {
    const g = newGame();
    g.players[0].hand.wood = 4;
    expect(transition(g, { type: "bank", give: "wood", receive: "ore" })).toBe(
      g,
    );
  });
  it("handles a 4:1 bank trade", () => {
    const g = transition(newGame(), { type: "roll", total: 7 });
    g.players[0].hand.wood = 4;
    const next = transition(g, { type: "bank", give: "wood", receive: "ore" });
    expect(next.players[0].hand.wood).toBe(0);
    expect(next.players[0].hand.ore).toBe(2);
  });
  it("exchanges cards between players without mutating the original hands", () => {
    const g = transition(newGame(), { type: "roll", total: 7 });
    const next = transition(g, {
      type: "playerTrade",
      give: "wood",
      receive: "ore",
    });
    expect(next.players[0].hand).toEqual({
      wood: 0,
      brick: 1,
      wheat: 1,
      ore: 2,
      sheep: 1,
    });
    expect(next.players[1].hand).toEqual({
      wood: 2,
      brick: 1,
      wheat: 1,
      ore: 0,
      sheep: 1,
    });
    expect(g.players[0].hand.wood).toBe(1);
  });
  it("rejects impossible, identical, and premature player trades", () => {
    const initial = newGame();
    expect(
      transition(initial, {
        type: "playerTrade",
        give: "wood",
        receive: "ore",
      }),
    ).toBe(initial);
    const game = transition(initial, { type: "roll", total: 7 });
    game.players[1].hand.ore = 0;
    expect(
      transition(game, { type: "playerTrade", give: "wood", receive: "ore" }),
    ).toBe(game);
    expect(
      transition(game, { type: "playerTrade", give: "wood", receive: "wood" }),
    ).toBe(game);
  });
  it("lets the bot prefer a trade that balances its hand", () => {
    const game = newGame();
    game.players[1].hand.ore = 3;
    expect(botAcceptsTrade(game, "wood", "ore")).toBe(true);
    expect(botAcceptsTrade(game, "ore", "wood")).toBe(false);
    game.players[1].hand.ore = 0;
    expect(botAcceptsTrade(game, "wood", "ore")).toBe(false);
  });
  it("can free capacity from a blocked seven-card hand", () => {
    const g = transition(newGame(), { type: "roll", total: 7 });
    g.players[0].hand = { wood: 2, brick: 0, wheat: 0, ore: 2, sheep: 3 };
    const next = transition(g, { type: "discard", resource: "sheep" });
    expect(next.players[0].hand.sheep).toBe(2);
    expect(
      goods.reduce((sum, resource) => sum + next.players[0].hand[resource], 0),
    ).toBe(6);
  });
  it("rejects discarding a resource that is absent", () => {
    const g = transition(newGame(), { type: "roll", total: 7 });
    g.players[0].hand.wood = 0;
    expect(transition(g, { type: "discard", resource: "wood" })).toBe(g);
  });
  it("awards victory when a city reaches five points", () => {
    const g = transition(newGame(), { type: "roll", total: 7 });
    g.players[0].settlements = [8, 20, 30, 40];
    g.players[0].hand.wheat = 2;
    g.players[0].hand.ore = 3;
    const next = transition(g, { type: "build", building: "city", at: 8 });
    expect(points(next.players[0])).toBe(5);
    expect(next.winner).toBe(0);
    expect(next.phase).toBe("end");
  });
  it("does not accept actions after the game ends", () => {
    const g = newGame();
    g.phase = "end";
    g.winner = 0;
    expect(transition(g, { type: "endTurn", now: 0 })).toBe(g);
  });
  it("keeps the original state unchanged after a valid roll", () => {
    const g = newGame();
    const next = transition(g, { type: "roll", total: 7 });
    expect(g.phase).toBe("roll");
    expect(next.phase).toBe("build");
  });
  it("rejects a bank trade involving the same resource", () => {
    const g = transition(newGame(), { type: "roll", total: 7 });
    g.players[0].hand.wood = 4;
    expect(transition(g, { type: "bank", give: "wood", receive: "wood" })).toBe(
      g,
    );
  });
  it("does not allow city upgrades on another player settlement", () => {
    const g = transition(newGame(), { type: "roll", total: 7 });
    g.players[0].hand.wheat = 2;
    g.players[0].hand.ore = 3;
    expect(
      transition(g, {
        type: "build",
        building: "city",
        at: g.players[1].settlements[0],
      }),
    ).toBe(g);
  });
});
describe("board analysis", () => {
  it("returns non-negative production for every resource", () => {
    const p = production(defaultBoard);
    for (const g of goods) expect(p[g]).toBeGreaterThanOrEqual(0);
  });
  it("seven produces no resources", () =>
    expect(
      Object.values(yieldForRoll(defaultBoard, [8], 7)).every((n) => n === 0),
    ).toBe(true));
  it("returns a finite trade ratio", () =>
    expect(
      Number.isFinite(tradeValue(defaultBoard, "wood", "ore", 2).ratio),
    ).toBe(true));
});
