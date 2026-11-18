import { describe, expect, it } from "vitest";
import { defaultBoard, pips, ports, vertices } from "../src/shared/board";
import {
  mistakeExamples,
  strategyOpportunities,
} from "../src/hexari/engine/analysis";

describe("opening strategy opportunities", () => {
  it("provides ten board-specific examples even during incomplete editing", () => {
    for (const board of [
      defaultBoard,
      defaultBoard.map(() => ({ resource: "desert" as const, number: null })),
    ]) {
      const examples = mistakeExamples(board, []);
      expect(examples).toHaveLength(10);
      for (const example of examples) {
        expect(vertices[example.corner]).toBeDefined();
        expect(example.example).toContain("Corner");
      }
    }
  });
  it("uses the strongest relevant corner rather than board-wide production", () => {
    const result = strategyOpportunities(defaultBoard, []);
    for (const [index, resources] of [
      [0, ["ore", "wheat"]],
      [1, ["wood", "brick"]],
    ] as const) {
      const expected = vertices.map((vertex) =>
        vertex.tiles.reduce((sum, id) => {
          const tile = defaultBoard[id];
          return (
            sum +
            ((resources as readonly string[]).includes(tile.resource)
              ? (pips[tile.number ?? 0] ?? 0)
              : 0)
          );
        }, 0),
      );
      expect(result[index].pips).toBe(Math.max(...expected));
    }
    expect(result[2].corner).toBeNull();
  });
  it("only counts the relevant resource at a specific port", () => {
    const port = { ...ports[0], resource: "ore" as const, rate: 2 as const };
    const signal = strategyOpportunities(defaultBoard, [port])[2];
    const candidates = [
      port.vertex,
      ...(port.otherVertex === undefined ? [] : [port.otherVertex]),
    ];
    const expected = candidates.map((id) =>
      vertices[id].tiles.reduce((sum, tileId) => {
        const tile = defaultBoard[tileId];
        return (
          sum + (tile.resource === "ore" ? (pips[tile.number ?? 0] ?? 0) : 0)
        );
      }, 0),
    );
    expect(signal.pips).toBe(Math.max(...expected));
    expect(candidates).toContain(signal.corner);
  });
});
