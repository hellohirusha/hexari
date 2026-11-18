import { describe, expect, it } from "vitest";
import {
  centers,
  decodeBoard,
  defaultBoard,
  encodeBoard,
  pips,
  placePalette,
  ports,
  scoreVertex,
  swapTiles,
  swapNumbers,
  validateBoard,
  vertices,
} from "../src/shared/board";

describe("board geometry", () => {
  it("places terrain or a number without modifying the source board", () => {
    const terrain = placePalette(defaultBoard, 0, {
      kind: "terrain",
      resource: "ore",
    });
    expect(terrain[0]).toEqual({ resource: "ore", number: 5 });
    const number = placePalette(defaultBoard, 0, { kind: "number", number: 8 });
    expect(number[0]).toEqual({ resource: "wood", number: 8 });
    expect(defaultBoard[0]).toEqual({ resource: "wood", number: 5 });
  });
  it("rejects a number on the desert and invalid numbers", () => {
    const desert = defaultBoard.findIndex((tile) => tile.resource === "desert");
    expect(
      placePalette(defaultBoard, desert, { kind: "number", number: 5 }),
    ).toBe(defaultBoard);
    expect(placePalette(defaultBoard, 0, { kind: "number", number: 7 })).toBe(
      defaultBoard,
    );
  });
  it("swaps only numbers while keeping terrain and inventory intact", () => {
    const result = swapNumbers(defaultBoard, 0, 1);
    expect(result[0]).toEqual({
      resource: defaultBoard[0].resource,
      number: defaultBoard[1].number,
    });
    expect(result[1]).toEqual({
      resource: defaultBoard[1].resource,
      number: defaultBoard[0].number,
    });
    expect(validateBoard(result)).toEqual([]);
  });
  it("rejects moving a number onto the desert", () => {
    expect(
      swapNumbers(
        defaultBoard,
        0,
        defaultBoard.findIndex((tile) => tile.resource === "desert"),
      ),
    ).toBe(defaultBoard);
  });
  it("swaps whole terrain and token pairs without mutating the original board", () => {
    const updated = swapTiles(defaultBoard, 0, 1);
    expect(updated[0]).toEqual(defaultBoard[1]);
    expect(updated[1]).toEqual(defaultBoard[0]);
    expect(validateBoard(updated)).toEqual([]);
    expect(defaultBoard[0].resource).toBe("wood");
  });
  it("ignores invalid tile positions", () =>
    expect(swapTiles(defaultBoard, -1, 1)).toBe(defaultBoard));
  it("starts with a valid tile and token inventory", () =>
    expect(validateBoard(defaultBoard)).toEqual([]));
  it("marks a duplicated terrain as nonstandard", () => {
    const board = defaultBoard.map((t) => ({ ...t }));
    board[0].resource = "ore";
    expect(validateBoard(board).length).toBeGreaterThan(0);
  });
  it("assigns nine distinct coastal ports", () => {
    expect(new Set(ports.map((p) => p.vertex)).size).toBe(9);
    expect(ports.every((p) => vertices[p.vertex].tiles.length < 3)).toBe(true);
  });
  it("constructs the standard board with 19 hexes and 54 unique vertices", () => {
    expect(centers).toHaveLength(19);
    expect(vertices).toHaveLength(54);
  });
  it("creates symmetric connections and no self edges", () => {
    for (const v of vertices)
      for (const neighbor of v.neighbors) {
        expect(neighbor).not.toBe(v.id);
        expect(vertices[neighbor].neighbors).toContain(v.id);
      }
  });
  it("assigns every tile exactly six corners", () => {
    for (let i = 0; i < 19; i++)
      expect(vertices.filter((v) => v.tiles.includes(i))).toHaveLength(6);
  });
});
describe("production and serialization", () => {
  it("matches all 36 equally likely dice outcomes at every corner", () => {
    for (const vertex of vertices) {
      let totalCards = 0;
      for (let first = 1; first <= 6; first++) {
        for (let second = 1; second <= 6; second++) {
          totalCards += vertex.tiles.filter(
            (index) =>
              defaultBoard[index].resource !== "desert" &&
              defaultBoard[index].number === first + second,
          ).length;
        }
      }
      const score = scoreVertex(defaultBoard, vertex);
      expect(score.production).toBe(totalCards);
      expect(score.expectedPerRoll).toBeCloseTo(totalCards / 36);
    }
  });
  it.each([
    [2, 1],
    [3, 2],
    [4, 3],
    [5, 4],
    [6, 5],
    [8, 5],
    [9, 4],
    [10, 3],
    [11, 2],
    [12, 1],
  ])("maps roll %i to %i pips", (roll, expected) => {
    expect(pips[roll]).toBe(expected);
  });
  it("represents the 36 two-dice outcomes with seven excluded", () => {
    expect(Object.values(pips).reduce((a, b) => a + b, 0)).toBe(30);
    expect(pips[6]).toBe(5);
    expect(pips[2]).toBe(1);
    expect(pips[7]).toBeUndefined();
  });
  it("sums pip values for each adjacent tile", () => {
    const vertex = vertices.find((v) => v.tiles.length === 3)!;
    expect(scoreVertex(defaultBoard, vertex).production).toBe(
      vertex.tiles.reduce(
        (sum, i) => sum + (pips[defaultBoard[i].number ?? 0] ?? 0),
        0,
      ),
    );
  });
  it("round trips a board and rejects malformed links", () => {
    expect(decodeBoard(encodeBoard(defaultBoard))).toEqual(defaultBoard);
    expect(decodeBoard("broken")).toBeNull();
    expect(
      decodeBoard(btoa(JSON.stringify([{ resource: "wood", number: 7 }]))),
    ).toBeNull();
  });
});
