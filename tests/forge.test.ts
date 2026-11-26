import { describe, expect, it } from "vitest";
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

function fundedGame(now?: number) {
  const game = newGame(now);
  for (const player of game.players)
    for (const resource of goods) player.hand[resource] = 1;
  return game;
}

describe("forge transitions", () => {
  it("starts manual games with no predetermined settlements", () => {
    const game = newGame(0, { manualSetup: true });
    expect(game.phase).toBe("setup");
    expect(game.players.map((player) => player.settlements)).toEqual([[], []]);
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
    let g = transition(fundedGame(), { type: "roll", total: 6 });
    const start = g.players[0].settlements[0];
    const to = vertices[start].neighbors[0];
    const before = { ...g.players[0].hand };
    expect(legalRoad(g, start, to)).toBe(true);
    g = transition(g, {
      type: "build",
      building: "road",
      at: start,
      to,
      now: 123,
    });
    expect(g.players[0].roads).toEqual([[start, to]]);
    expect(g.players[0].hand.wood).toBe(before.wood - 1);
    expect(g.players[0].hand.brick).toBe(before.brick - 1);
    expect(g.turn).toBe(1);
    expect(g.phase).toBe("roll");
    expect(g.turnStarted).toBe(123);
  });
  it("does not permit building an unconnected road", () => {
    const g = transition(fundedGame(), { type: "roll", total: 6 });
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
    const game = transition(fundedGame(0), { type: "roll", total: 6 });
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
    expect(city.players[0].settlements).not.toContain(start);
    expect([city.turn, city.phase, city.turnStarted]).toEqual([1, "roll", 43]);
    expect(
      transition(game, { type: "build", building: "city", at: start, now: 44 }),
    ).toBe(game);
  });
  it("allows production to increase a hand beyond seven cards", () => {
    const g = newGame();
    for (const x of goods) g.players[0].hand[x] = 0;
    g.players[0].hand.wood = 7;
    const n =
      defaultBoard[vertices[g.players[0].settlements[0]].tiles[0]].number ?? 7;
    const result = transition(g, { type: "roll", total: n });
    expect(
      goods.reduce((s, x) => s + result.players[0].hand[x], 0),
    ).toBeGreaterThan(7);
  });
  it("does not allow a bank trade before rolling", () => {
    const g = newGame();
    g.players[0].hand.wood = 4;
    expect(transition(g, { type: "bank", give: "wood", receive: "ore" })).toBe(
      g,
    );
  });
  it("handles a 4:1 bank trade", () => {
    const g = transition(fundedGame(), { type: "roll", total: 6 });
    g.players[0].hand.wood = 4;
    const next = transition(g, { type: "bank", give: "wood", receive: "ore" });
    expect(next.players[0].hand.wood).toBe(0);
    expect(next.players[0].hand.ore).toBe(2);
  });
  it("exchanges cards between players without mutating the original hands", () => {
    const g = transition(fundedGame(), { type: "roll", total: 6 });
    const [first, second] = g.players.map((player) => ({ ...player.hand }));
    const next = transition(g, {
      type: "playerTrade",
      give: "wood",
      receive: "ore",
    });
    expect(next.players[0].hand).toEqual({
      ...first,
      wood: first.wood - 1,
      ore: first.ore + 1,
    });
    expect(next.players[1].hand).toEqual({
      ...second,
      wood: second.wood + 1,
      ore: second.ore - 1,
    });
    expect(g.players[0].hand).toEqual(first);
    expect(g.players[1].hand).toEqual(second);
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
    const game = transition(initial, { type: "roll", total: 6 });
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
  it("can discard a selected resource during the build phase", () => {
    const g = transition(fundedGame(), { type: "roll", total: 6 });
    g.players[0].hand = { wood: 2, brick: 0, wheat: 0, ore: 2, sheep: 3 };
    const next = transition(g, { type: "discard", resource: "sheep" });
    expect(next.players[0].hand.sheep).toBe(2);
    expect(
      goods.reduce((sum, resource) => sum + next.players[0].hand[resource], 0),
    ).toBe(6);
  });
  it("rejects discarding a resource that is absent", () => {
    const g = transition(fundedGame(), { type: "roll", total: 6 });
    g.players[0].hand.wood = 0;
    expect(transition(g, { type: "discard", resource: "wood" })).toBe(g);
  });
  it("awards victory when a city reaches five points", () => {
    const g = transition(fundedGame(), { type: "roll", total: 6 });
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
    expect(next.phase).toBe("robber");
  });
  it("rejects a bank trade involving the same resource", () => {
    const g = transition(fundedGame(), { type: "roll", total: 6 });
    g.players[0].hand.wood = 4;
    expect(transition(g, { type: "bank", give: "wood", receive: "wood" })).toBe(
      g,
    );
  });
  it("does not allow city upgrades on another player settlement", () => {
    const g = transition(fundedGame(), { type: "roll", total: 6 });
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
