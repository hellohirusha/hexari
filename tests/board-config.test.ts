import { describe, expect, it } from "vitest";
import {
  defaultBoard,
  ports,
  encodeBoard,
  encodeBoardConfig,
  decodeBoard,
  decodeBoardConfig,
  scoreVertex,
  validateBoard,
  vertices,
} from "../src/shared/board";
import { balanceSeatDraft, simulateSeats } from "../src/hexari/engine/analysis";

describe("editable board ports", () => {
  it("assigns each default port to a distinct coastal edge", () => {
    const corners = ports.flatMap((p) => [p.vertex, p.otherVertex]);
    expect(corners).toHaveLength(18);
    expect(corners.every((id) => id !== undefined)).toBe(true);
    expect(new Set(corners).size).toBe(18);
    for (const port of ports) {
      const other = vertices[port.otherVertex!];
      expect(vertices[port.vertex].neighbors).toContain(other.id);
      expect(
        vertices[port.vertex].tiles.filter((tile) =>
          other.tiles.includes(tile),
        ),
      ).toHaveLength(1);
      expect(
        scoreVertex(defaultBoard, other, "balanced", undefined, ports).port,
      ).toBe(port.resource);
    }
    expect(
      decodeBoardConfig(encodeBoardConfig({ board: defaultBoard, ports })),
    ).toEqual({ board: defaultBoard, ports });
  });
  it("round-trips custom port layouts and remains compatible with legacy links", () => {
    const layout = [
      { vertex: ports[0].vertex, resource: "ore" as const, rate: 2 as const },
    ];
    const encoded = encodeBoardConfig({ board: defaultBoard, ports: layout });
    expect(decodeBoardConfig(encoded)).toEqual({
      board: defaultBoard,
      ports: layout,
    });
    expect(decodeBoard(encoded)).toEqual(defaultBoard);
    expect(decodeBoardConfig(encodeBoard(defaultBoard))?.ports).toEqual(ports);
    expect(
      scoreVertex(
        defaultBoard,
        vertices[layout[0].vertex],
        "balanced",
        undefined,
        layout,
      ).port,
    ).toBe("ore");
    expect(
      scoreVertex(
        defaultBoard,
        vertices[layout[0].vertex],
        "balanced",
        undefined,
        [],
      ).port,
    ).toBeNull();
  });
  it("rejects duplicate, inland and inconsistent ports", () => {
    const inland = vertices.find((v) => v.tiles.length === 3)!;
    for (const layout of [
      [ports[0], ports[0]],
      [{ vertex: inland.id, resource: "wood", rate: 2 }],
      [{ vertex: ports[0].vertex, resource: "wood", rate: 3 }],
    ]) {
      expect(
        decodeBoardConfig(
          btoa(
            JSON.stringify({ version: 1, board: defaultBoard, ports: layout }),
          ),
        ),
      ).toBeNull();
    }
  });
});
describe("four-seat draft balancing", () => {
  it.each([7, 19, 51, 123, 421, 900, 1024, 2026, 4096, 8191, 32749, 65521])(
    "preserves the inventory and reports the actual draft gap for seed %i",
    (initialSeed) => {
      let seed = initialSeed;
      const random = () =>
        ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      const result = balanceSeatDraft(defaultBoard, ports, {
        generateNew: true,
        iterations: 30,
        threshold: 3,
        random,
      });
      const scores = simulateSeats(result.board, ports).map(
        (seat) => seat.score,
      );
      expect(validateBoard(result.board)).toEqual([]);
      expect(result.gap).toBeCloseTo(Math.max(...scores) - Math.min(...scores));
      expect(result.tried).toBeGreaterThan(0);
      expect(result.tried).toBeLessThanOrEqual(30);
      if (result.reached) {
        expect(result.board).not.toEqual(defaultBoard);
        expect(result.gap).toBeLessThanOrEqual(3);
      }
    },
  );
  it("can generate a different board even when the input already meets the target", () => {
    let seed = 42;
    const random = () =>
      ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const result = balanceSeatDraft(defaultBoard, ports, {
      generateNew: true,
      threshold: 10,
      iterations: 100,
      random,
    });
    expect(result.reached).toBe(true);
    expect(result.tried).toBeGreaterThan(0);
    expect(result.board).not.toEqual(defaultBoard);
    expect(result.gap).toBeLessThanOrEqual(10);
    expect(result.board.map((tile) => JSON.stringify(tile)).sort()).toEqual(
      defaultBoard.map((tile) => JSON.stringify(tile)).sort(),
    );
  });
  it("reports failure if every shuffle leaves the board unchanged", () => {
    const result = balanceSeatDraft(defaultBoard, ports, {
      generateNew: true,
      threshold: 10,
      iterations: 3,
      random: () => 0.999999,
    });
    expect(result.reached).toBe(false);
    expect(result.tried).toBe(3);
    expect(result.board).toEqual(defaultBoard);
  });
  it("keeps all eight placements legal across reproducible balanced searches", () => {
    for (const initialSeed of [11, 42, 117, 501]) {
      let seed = initialSeed;
      const random = () =>
        ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      const result = balanceSeatDraft(defaultBoard, ports, {
        iterations: 12,
        threshold: 0,
        random,
      });
      const picks = result.seats.flatMap((seat) => seat.corners);
      expect(picks).toHaveLength(8);
      expect(new Set(picks).size).toBe(8);
      for (const id of picks)
        expect(
          vertices[id].neighbors.some((neighbor) => picks.includes(neighbor)),
        ).toBe(false);
      expect(result.reached).toBe(result.gap <= result.threshold);
      expect(result.board.map((tile) => JSON.stringify(tile)).sort()).toEqual(
        defaultBoard.map((tile) => JSON.stringify(tile)).sort(),
      );
    }
  });
  it("assigns two distance-legal corners to each player in snake order", () => {
    const seats = simulateSeats(defaultBoard);
    expect(seats).toHaveLength(4);
    const picks = seats.flatMap((s) => s.corners);
    expect(picks).toHaveLength(8);
    expect(new Set(picks).size).toBe(8);
    for (const pick of picks)
      expect(vertices[pick].neighbors.some((n) => picks.includes(n))).toBe(
        false,
      );
  });
  it("preserves board inventory and reports whether its target was reached", () => {
    let seed = 4;
    const random = () =>
      ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const initial = simulateSeats(defaultBoard).map((s) => s.score);
    const result = balanceSeatDraft(defaultBoard, ports, {
      iterations: 20,
      threshold: 0,
      random,
    });
    expect(result.board.map((t) => JSON.stringify(t)).sort()).toEqual(
      defaultBoard.map((t) => JSON.stringify(t)).sort(),
    );
    expect(result.gap).toBeLessThanOrEqual(
      Math.max(...initial) - Math.min(...initial),
    );
    expect(result.reached).toBe(result.gap <= result.threshold);
  });
});
