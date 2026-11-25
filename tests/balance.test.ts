import { describe, expect, it } from "vitest";
import {
  balanceBoard,
  balanceSeatDraft,
  regionalOpenings,
} from "../src/hexari/engine/analysis";
import { defaultBoard, ports, vertices } from "../src/shared/board";

describe("regional opening analysis", () => {
  it("returns four legal pairs in their stated regions", () => {
    const regions = regionalOpenings(defaultBoard);
    expect(regions).toHaveLength(4);
    regions.forEach((region, index) => {
      expect(region.corners).toBeDefined();
      const [a, b] = region.corners!;
      expect(a).not.toBe(b);
      expect(vertices[a].neighbors).not.toContain(b);
      for (const id of [a, b])
        expect(
          (vertices[id].x >= 0 ? 1 : 0) + (vertices[id].y >= 0 ? 2 : 0),
        ).toBe(index);
    });
  });
  it("preserves every tile and does not worsen the chosen score", () => {
    let seed = 123;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const gap = (board: typeof defaultBoard) => {
      const scores = regionalOpenings(board).map((r) => r.pips);
      return Math.max(...scores) - Math.min(...scores);
    };
    const balanced = balanceBoard(defaultBoard, 50, random);
    expect(balanced.map((t) => JSON.stringify(t)).sort()).toEqual(
      defaultBoard.map((t) => JSON.stringify(t)).sort(),
    );
    expect(gap(balanced)).toBeLessThanOrEqual(gap(defaultBoard));
  });
});

describe("balanced board generation", () => {
  it("does not report success for an invalid starting layout when no search is allowed", () => {
    const board = defaultBoard.map((tile) => ({ ...tile }));
    board[3].number = 8;
    board[4].number = 6;
    const result = balanceSeatDraft(board, ports, {
      iterations: 0,
      threshold: Number.POSITIVE_INFINITY,
    });
    expect(result.reached).toBe(false);
    expect(result.board).toEqual(board);
  });

  it("does not generate adjacent six and eight tokens", () => {
    let seed = 42;
    const random = () =>
      ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const result = balanceSeatDraft(defaultBoard, ports, {
      generateNew: true,
      random,
    });
    expect(result.reached).toBe(true);
    for (const vertex of vertices) {
      const red = vertex.tiles.filter((index) =>
        [6, 8].includes(result.board[index].number ?? 0),
      );
      expect(red.length).toBeLessThanOrEqual(1);
    }
  });
});
