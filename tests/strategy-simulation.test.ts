import { describe, expect, it } from "vitest";
import { defaultBoard, pips, ports, vertices } from "../src/shared/board";
import { regionalOpenings } from "../src/hexari/engine/analysis";
import {
  simulateStrategyDistribution,
  simulateStrategyRace,
  startingResources,
  distributeProduction,
  sampleStrategyBoard,
} from "../src/hexari/engine/strategySimulation";
import { emptyHand } from "../src/shared/resources";

describe("strategy race model", () => {
  it("samples separated high-probability tokens and preserves tile inventory", () => {
    let seed = 42;
    const random = () =>
      ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 20; i++) {
      const board = sampleStrategyBoard(defaultBoard, random)!;
      expect(board.map((tile) => JSON.stringify(tile)).sort()).toEqual(
        defaultBoard.map((tile) => JSON.stringify(tile)).sort(),
      );
      for (const vertex of vertices) {
        expect(
          vertex.tiles.filter((index) =>
            [6, 8].includes(board[index].number ?? 0),
          ).length,
        ).toBeLessThanOrEqual(1);
      }
    }
  });
  it("bounds sampling and reports impossible layouts as skipped", () => {
    const impossible = defaultBoard.map((tile) => ({ ...tile, number: 6 }));
    let calls = 0;
    expect(
      sampleStrategyBoard(
        impossible,
        () => {
          calls++;
          return 0.5;
        },
        3,
      ),
    ).toBeNull();
    expect(calls).toBe(3 * (impossible.length - 1));
    const result = simulateStrategyDistribution(impossible, [], { boards: 2 });
    expect(result.games).toBe(0);
    expect(result.skippedBoards).toBe(2);
    expect(result.unfinished).toBe(0);
    expect(Object.values(result.wins)).toEqual([0, 0, 0, 0]);
  });
  it("handles shared bank shortages and a single claimant with a partial supply", () => {
    const board = defaultBoard.map(() => ({
      resource: "desert" as const,
      number: null,
    }));
    const producingBoard: typeof defaultBoard = board.map((tile) => ({
      ...tile,
    }));
    producingBoard[0] = { resource: "wood", number: 6 };
    const corners = vertices.filter((vertex) => vertex.tiles.includes(0));
    const first = {
      settlements: [],
      cities: [corners[0].id],
      hand: emptyHand(),
    };
    const second = {
      settlements: [corners[1].id],
      cities: [],
      hand: emptyHand(),
    };
    const bank = { wood: 2, brick: 19, wheat: 19, ore: 19, sheep: 19 };
    distributeProduction(producingBoard, [first, second], bank, 6);
    expect(first.hand.wood).toBe(0);
    expect(second.hand.wood).toBe(0);
    expect(bank.wood).toBe(2);
    bank.wood = 1;
    distributeProduction(producingBoard, [first], bank, 6);
    expect(first.hand.wood).toBe(1);
    expect(bank.wood).toBe(0);
  });
  it("starts with one card from every producing tile at the second settlement", () => {
    const corner = vertices.find((vertex) => vertex.tiles.length === 3)!;
    const board = defaultBoard.map((tile) => ({ ...tile }));
    board[corner.tiles[0]] = { resource: "wood", number: 5 };
    board[corner.tiles[1]] = { resource: "wood", number: 9 };
    board[corner.tiles[2]] = { resource: "desert", number: null };
    expect(startingResources(board, corner.id)).toEqual({
      wood: 2,
      brick: 0,
      wheat: 0,
      ore: 0,
      sheep: 0,
    });
  });
  it("reproduces outcomes and counts every seat rotation", () => {
    const options = { boards: 3, seed: 42, maxTurns: 400 };
    const first = simulateStrategyDistribution(defaultBoard, ports, options);
    expect(simulateStrategyDistribution(defaultBoard, ports, options)).toEqual(
      first,
    );
    expect(first.games).toBe(12);
    expect(
      Object.values(first.wins).reduce((sum, wins) => sum + wins, 0) +
        first.unfinished,
    ).toBe(first.games);
    expect(first.unfinished).toBeLessThan(first.games);
  });
  it("counts timeouts instead of inventing winners", () => {
    const result = simulateStrategyDistribution(defaultBoard, ports, {
      boards: 2,
      maxTurns: 0,
    });
    expect(result.unfinished).toBe(8);
    expect(Object.values(result.wins)).toEqual([0, 0, 0, 0]);
  });
  it("does not mutate the user's board or ports", () => {
    const board = structuredClone(defaultBoard),
      boardPorts = structuredClone(ports);
    simulateStrategyDistribution(board, boardPorts, { boards: 1 });
    expect(board).toEqual(defaultBoard);
    expect(boardPorts).toEqual(ports);
  });
  it("runs the displayed 96-game scenario", () => {
    const result = simulateStrategyDistribution(defaultBoard, ports);
    expect(result.games).toBe(96);
    expect(
      Object.values(result.wins).reduce((sum, wins) => sum + wins, 0) +
        result.unfinished,
    ).toBe(96);
  });
  it("leaves a board with no production unfinished", () => {
    const board = defaultBoard.map(() => ({
      resource: "desert" as const,
      number: null,
    }));
    expect(simulateStrategyRace(board, [], 0, () => 0.5, 50)).toBeNull();
  });
});

describe("quadrant openings", () => {
  it("selects non-adjacent corners in each region", () => {
    for (const region of regionalOpenings(defaultBoard)) {
      expect(region.corners).toBeDefined();
      const [a, b] = region.corners!;
      expect(a).not.toBe(b);
      expect(vertices[a].neighbors).not.toContain(b);
      expect(region.pips).toBeGreaterThan(0);
      expect(region.pips).toBeLessThanOrEqual(30);
      const score = (id: number) =>
        vertices[id].tiles.reduce(
          (sum, tile) => sum + (pips[defaultBoard[tile].number ?? 0] ?? 0),
          0,
        );
      expect(region.pips).toBe(score(a) + score(b));
      const sameQuadrant = vertices.filter(
        (v) =>
          v.x >= 0 === vertices[a].x >= 0 && v.y >= 0 === vertices[a].y >= 0,
      );
      for (const first of sameQuadrant)
        for (const second of sameQuadrant) {
          if (first.id !== second.id && !first.neighbors.includes(second.id))
            expect(score(first.id) + score(second.id)).toBeLessThanOrEqual(
              region.pips,
            );
        }
    }
  });
});
