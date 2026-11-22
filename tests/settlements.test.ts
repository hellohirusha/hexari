import { describe, expect, it } from "vitest";
import { defaultBoard, pips, scoreVertex, vertices } from "../src/shared/board";
import { rankSettlements } from "../src/hexari/engine/settlements";

describe("settlement optimizer", () => {
  it("scores eligible corners out of 100 relative to the best legal option", () => {
    const ranking = rankSettlements(defaultBoard, "balanced", [], 8);
    const legal = ranking.filter((entry) => entry.eligible);
    expect(legal[0].scoreOutOf100).toBeCloseTo(100);
    for (const corner of legal) {
      expect(corner.scoreOutOf100).not.toBeNull();
      expect(corner.scoreOutOf100!).toBeGreaterThanOrEqual(0);
      expect(corner.scoreOutOf100!).toBeLessThanOrEqual(100);
      expect(corner.scoreOutOf100!).toBeCloseTo(
        (100 * corner.score) / legal[0].score,
      );
    }
    expect(ranking.filter((entry) => !entry.eligible)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 8, scoreOutOf100: null }),
      ]),
    );
  });
  it("calculates a uniform-board score from independently derived components", () => {
    const board = defaultBoard.map(() => ({
      resource: "wood" as const,
      number: 6,
    }));
    const vertex = vertices.find((v) => v.tiles.length === 3)!;
    const score = scoreVertex(board, vertex, "road", undefined, []);
    expect(score.production).toBe(15);
    expect(score.expectedPerRoll).toBeCloseTo(15 / 36);
    expect(score.unique).toBe(1);
    expect(score.diversityBonus).toBe(1.5);
    expect(score.focus).toBeCloseTo(6);
    expect(score.scarcity).toBeCloseTo(90 / 95);
    expect(score.score).toBeCloseTo(15 + 1.5 + 6 + 90 / 95);
  });
  it("applies the distance rule for every possible first corner and strategy", () => {
    for (const first of vertices) {
      for (const strategy of ["balanced", "ore", "road", "port"] as const) {
        const ranked = rankSettlements(defaultBoard, strategy, [], first.id);
        const blocked = new Set([first.id, ...first.neighbors]);
        expect(ranked).toHaveLength(54);
        for (const item of ranked)
          expect(item.eligible).toBe(!blocked.has(item.id));
        const legal = ranked.filter((item) => item.eligible);
        expect(legal[0].rank).toBe(1);
        expect(
          legal.every((item) => item.eligibleCount === 54 - blocked.size),
        ).toBe(true);
      }
    }
  });
  it("matches dice probabilities and exposes a complete score breakdown", () => {
    const ranking = rankSettlements(defaultBoard, "road", []);
    for (const corner of ranking) {
      const expected = corner.tiles.reduce(
        (sum, tile) => sum + (pips[defaultBoard[tile].number ?? 0] ?? 0),
        0,
      );
      expect(corner.production).toBe(expected);
      expect(corner.expectedPerRoll).toBeCloseTo(expected / 36);
      expect(corner.score).toBeCloseTo(
        corner.production +
          corner.diversityBonus +
          corner.complement +
          corner.focus +
          corner.scarcity +
          corner.portBonus,
      );
    }
  });

  it("excludes the first settlement and adjacent corners from second-placement ranks", () => {
    const first = 8;
    const ranking = rankSettlements(defaultBoard, "balanced", [], first);
    const invalid = [first, ...vertices[first].neighbors];
    for (const id of invalid) {
      const item = ranking.find((v) => v.id === id)!;
      expect(item.eligible).toBe(false);
      expect(item.rank).toBeNull();
      expect(item.percentile).toBeNull();
    }
    const legal = ranking.filter((v) => v.eligible);
    expect(legal[0].rank).toBe(1);
    expect(legal.every((v) => v.eligibleCount === legal.length)).toBe(true);
    expect(legal.every((v) => v.percentile! >= 0 && v.percentile! <= 100)).toBe(
      true,
    );
  });

  it("weights strategy resources and accounts for ports at both corners", () => {
    const vertex = vertices.find((v) =>
      v.tiles.some((i) => defaultBoard[i].resource === "wood"),
    )!;
    const balanced = scoreVertex(
      defaultBoard,
      vertex,
      "balanced",
      undefined,
      [],
    );
    const road = scoreVertex(defaultBoard, vertex, "road", undefined, []);
    expect(road.focus).toBeGreaterThan(0);
    expect(road.score).toBeGreaterThan(balanced.score);
    const coastal = vertices.find(
      (v) =>
        v.tiles.length < 3 &&
        v.neighbors.some(
          (n) =>
            vertices[n].tiles.length < 3 &&
            v.tiles.filter((t) => vertices[n].tiles.includes(t)).length === 1,
        ),
    )!;
    const neighbor = coastal.neighbors.find(
      (n) =>
        vertices[n].tiles.length < 3 &&
        coastal.tiles.filter((t) => vertices[n].tiles.includes(t)).length === 1,
    )!;
    const port = [
      {
        vertex: coastal.id,
        otherVertex: neighbor,
        resource: "wood" as const,
        rate: 2 as const,
      },
    ];
    expect(
      scoreVertex(defaultBoard, vertices[neighbor], "port", undefined, port)
        .portRate,
    ).toBe(2);
    expect(
      scoreVertex(defaultBoard, vertices[neighbor], "port", undefined, port)
        .portBonus,
    ).toBeGreaterThan(
      scoreVertex(defaultBoard, vertices[neighbor], "balanced", undefined, port)
        .portBonus,
    );
  });

  it("does not count the same new resource twice in the second-placement bonus", () => {
    const first = vertices[0];
    const target = vertices.find(
      (v) => v.id !== first.id && v.tiles.length >= 2,
    )!;
    const board = defaultBoard.map((t) => ({ ...t }));
    for (const index of first.tiles) board[index].resource = "wood";
    for (const index of target.tiles.filter((i) => !first.tiles.includes(i)))
      board[index].resource = "brick";
    expect(
      scoreVertex(board, target, "balanced", first, []).complement,
    ).toBeLessThanOrEqual(1);
  });
});
