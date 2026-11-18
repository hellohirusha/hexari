import { describe, expect, it } from "vitest";
import { balanceBoard, regionalOpenings } from "../src/hexari/engine/analysis";
import { defaultBoard, vertices } from "../src/shared/board";

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
