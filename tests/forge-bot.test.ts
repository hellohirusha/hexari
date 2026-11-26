import { describe, expect, it } from "vitest";
import { playBotDiscard, playBotTurn } from "../src/forge/bot";
import {
  legalSetupSettlement,
  legalSettlement,
  newGame,
  remainingPieces,
  transition,
} from "../src/forge/engine";
import { vertices } from "../src/forge/board";

describe("Forge bot", () => {
  it("discards the bot's required cards during the human player's seven", () => {
    const game = newGame(0);
    game.phase = "discard";
    game.turn = 0;
    game.discardRemaining = [3, 4];
    game.players[0].hand = { wood: 6, brick: 0, wheat: 0, ore: 0, sheep: 0 };
    game.players[1].hand = { wood: 5, brick: 4, wheat: 0, ore: 0, sheep: 0 };
    const next = playBotDiscard(game);
    expect(next.discardRemaining).toEqual([3, 0]);
    expect(next.players[0].hand).toEqual(game.players[0].hand);
    expect(Object.values(next.players[1].hand).reduce((a, b) => a + b, 0)).toBe(
      5,
    );
    expect(next.phase).toBe("discard");
  });

  it("waits for the human's discard after rolling seven", () => {
    const game = newGame(0);
    game.turn = 1;
    game.players[0].hand = { wood: 8, brick: 0, wheat: 0, ore: 0, sheep: 0 };
    game.players[1].hand = { wood: 0, brick: 8, wheat: 0, ore: 0, sheep: 0 };
    const result = playBotTurn(game, 7, 2, undefined, () => 0.5);
    expect(result.game.phase).toBe("discard");
    expect(result.game.discardRemaining).toEqual([4, 0]);
    expect(result.game.players[0].hand.wood).toBe(8);
    expect(result.game.turn).toBe(1);
    expect(result.actions).not.toContain("Ended turn");
  });

  it("resumes the bot's turn after the human finishes a required discard", () => {
    const game = newGame(0);
    game.turn = 1;
    game.players[0].hand = { wood: 8, brick: 0, wheat: 0, ore: 0, sheep: 0 };
    const rolled = playBotTurn(game, 7, 2, undefined, () => 0).game;
    expect(rolled.phase).toBe("discard");

    let afterDiscard = rolled;
    for (let i = 0; i < 4; i++) {
      afterDiscard = transition(afterDiscard, {
        type: "sevenDiscard",
        seat: 0,
        resource: "wood",
      });
    }
    expect(afterDiscard.phase).toBe("robber");

    const result = playBotTurn(afterDiscard, 7, 3, undefined, () => 0);
    expect(result.actions).toContain("Moved the robber");
    expect(result.game.phase).toBe("roll");
    expect(result.game.turn).toBe(0);
    expect(result.game.players[0].hand.wood).toBe(3);
    expect(result.game.players[1].hand.wood).toBe(1);
  });

  it("moves the robber to the opponent and steals before ending its turn", () => {
    const game = newGame(0);
    game.phase = "robber";
    game.turn = 1;
    game.players[0].hand = { wood: 3, brick: 0, wheat: 0, ore: 0, sheep: 0 };
    game.players[1].hand = { wood: 0, brick: 0, wheat: 0, ore: 0, sheep: 0 };
    const result = playBotTurn(game, 7, 2, undefined, () => 0);
    expect(vertices[game.players[0].settlements[0]].tiles).toContain(
      result.game.robberTile,
    );
    expect(result.game.players[0].hand.wood).toBe(2);
    expect(result.game.players[1].hand.wood).toBe(1);
    expect(result.actions).toContain("Moved the robber");
    expect(result.game.turn).toBe(0);
  });
  it("varies its starting location and keeps at least three edges away", () => {
    const placed = transition(newGame(0, { manualSetup: true }), {
      type: "build",
      building: "settlement",
      at: 23,
      now: 1,
    });
    const first = transition(placed, {
      type: "build",
      building: "road",
      at: 23,
      to: vertices[23].neighbors[0],
      now: 2,
    });
    const a = playBotTurn(first, 7, 2, undefined, () => 0).game.players[1]
      .settlements[0];
    const b = playBotTurn(first, 7, 2, undefined, () => 0.999).game.players[1]
      .settlements[0];
    expect(a).not.toBe(b);
    const withinTwo = new Set([23, ...vertices[23].neighbors]);
    for (const id of vertices[23].neighbors)
      for (const neighbor of vertices[id].neighbors) withinTwo.add(neighbor);
    expect(withinTwo.has(a)).toBe(false);
    expect(withinTwo.has(b)).toBe(false);
  });
  it("chooses distinct, distant legal openings for every legal first placement", () => {
    const initial = newGame(0, { manualSetup: true });
    for (const vertex of vertices.filter((v) =>
      legalSetupSettlement(initial, v.id),
    )) {
      const placed = transition(initial, {
        type: "build",
        building: "settlement",
        at: vertex.id,
        now: 1,
      });
      const setup = transition(placed, {
        type: "build",
        building: "road",
        at: vertex.id,
        to: vertex.neighbors[0],
        now: 2,
      });
      const low = playBotTurn(setup, 7, 2, undefined, () => 0).game.players[1]
        .settlements[0];
      const high = playBotTurn(setup, 7, 2, undefined, () => 0.999).game
        .players[1].settlements[0];
      expect(legalSetupSettlement(setup, low)).toBe(true);
      expect(legalSetupSettlement(setup, high)).toBe(true);
      const near = new Set([vertex.id, ...vertex.neighbors]);
      for (const neighbor of vertex.neighbors)
        for (const next of vertices[neighbor].neighbors) near.add(next);
      expect(near.has(low)).toBe(false);
      expect(near.has(high)).toBe(false);
      expect(low).not.toBe(high);
    }
  });
  it("places a free starting road connected to the bot settlement", () => {
    const firstCorner = 23;
    const settlement = transition(newGame(0, { manualSetup: true }), {
      type: "build",
      building: "settlement",
      at: firstCorner,
      now: 1,
    });
    const humanRoad = transition(settlement, {
      type: "build",
      building: "road",
      at: firstCorner,
      to: vertices[firstCorner].neighbors[0],
      now: 2,
    });
    const botSettlement = playBotTurn(humanRoad, 7, 3, undefined, () => 0).game;
    const botCorner = botSettlement.players[1].settlements[0];
    expect(Object.values(botSettlement.players[1].hand)).toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect(remainingPieces(botSettlement.players[1], "settlement")).toBe(4);
    const handBeforeRoad = { ...botSettlement.players[1].hand };
    const recorded: unknown[] = [];
    const result = playBotTurn(botSettlement, 7, 4, (action) =>
      recorded.push(action),
    );

    expect(result.game.players[1].roads).toHaveLength(1);
    const [from, to] = result.game.players[1].roads[0];
    expect([from, to]).toContain(botCorner);
    expect(vertices[from].neighbors).toContain(to);
    expect(result.game.players[1].hand).toEqual(handBeforeRoad);
    expect(remainingPieces(result.game.players[1], "road")).toBe(14);
    expect(result.game.phase).toBe("roll");
    expect(result.game.turn).toBe(0);
    expect(recorded).toEqual([
      { type: "build", actor: 1, building: "road", setup: true },
    ]);
  });
  it("rolls and passes control back to the human", () => {
    const botTurn = transition(newGame(0), { type: "endTurn", now: 1 });
    const result = playBotTurn(botTurn, 8, 2);
    expect(result.actions[0]).toBe("Rolled 8");
    expect(result.game.turn).toBe(0);
    expect(result.game.phase).toBe("roll");
    expect(result.game.turnStarted).toBe(2);
    expect(botTurn.phase).toBe("roll");
  });

  it("does not play the human turn", () => {
    const game = newGame(0);
    expect(playBotTurn(game, 8, 2)).toEqual({ game, actions: [] });
  });

  it("trades for a missing sheep and saves road resources to build a settlement", () => {
    const game = newGame(0);
    game.turn = 1;
    game.phase = "build";
    const start = game.players[1].settlements[0];
    const paths = vertices[start].neighbors.flatMap((middle) =>
      vertices[middle].neighbors
        .filter((end) => end !== start)
        .map((end) => [middle, end] as const),
    );
    const path = paths.find(([middle, end]) => {
      const trial = structuredClone(game);
      trial.players[1].roads = [
        [start, middle],
        [middle, end],
      ];
      return legalSettlement(trial, end);
    });
    expect(path).toBeDefined();
    const [middle, end] = path!;
    game.players[1].roads = [
      [start, middle],
      [middle, end],
    ];
    game.players[1].hand = { wood: 1, brick: 1, wheat: 1, ore: 4, sheep: 0 };

    const result = playBotTurn(game, 8, 2);
    expect(result.actions).toContain("Traded with the bank");
    expect(result.game.players[1].settlements).toContain(end);
    expect(result.game.players[1].roads).toHaveLength(2);
  });

  it("finishes a game when its legal build reaches five points", () => {
    const botTurn = transition(newGame(0), { type: "endTurn", now: 1 });
    botTurn.phase = "build";
    botTurn.players[1].cities = [0, 1];
    botTurn.players[1].hand = { wood: 0, brick: 0, wheat: 2, ore: 3, sheep: 0 };
    const result = playBotTurn(botTurn, 8, 2);
    expect(result.game.phase).toBe("end");
    expect(result.game.winner).toBe(1);
  });
});
