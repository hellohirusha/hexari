import { describe, expect, it } from "vitest";
import { defaultBoard, pips, ports, vertices } from "../src/shared/board";
import { regionalOpenings } from "../src/hexari/engine/analysis";
import {
  simulateStrategyDistribution,
  simulateStrategyRace,
} from "../src/hexari/engine/strategySimulation";

describe("strategy race model", () => {
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
