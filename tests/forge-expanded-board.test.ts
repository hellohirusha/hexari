import { describe, expect, it } from "vitest";
import { centers, defaultBoard, vertices } from "../src/forge/board";
import { vertices as originalVertices } from "../src/shared/board";
import { newGame, transition } from "../src/forge/engine";
import { parseResumableGame } from "../src/forge/savedGame";

describe("expanded Forge board", () => {
  it("forms a complete radius-three hexagon while preserving original corner IDs", () => {
    expect(centers).toHaveLength(37);
    expect(defaultBoard).toHaveLength(37);
    for (let r = -3; r <= 3; r++) {
      expect(
        centers.filter((center) => Math.abs(center.y - r * 1.5) < 0.001),
      ).toHaveLength(7 - Math.abs(r));
    }
    for (const old of originalVertices) {
      expect(vertices[old.id]).toMatchObject({
        id: old.id,
        x: old.x,
        y: old.y,
      });
      expect(
        old.neighbors.every((n) => vertices[old.id].neighbors.includes(n)),
      ).toBe(true);
    }
    for (let tile = 19; tile < 37; tile++) {
      const corners = vertices.filter((v) => v.tiles.includes(tile));
      expect(corners).toHaveLength(6);
      expect(corners.some((v) => v.tiles.some((t) => t !== tile))).toBe(true);
    }
    for (const vertex of vertices)
      for (const neighbor of vertex.neighbors)
        expect(vertices[neighbor].neighbors).toContain(vertex.id);
  });

  it("produces resources on new tiles and saves new corners", () => {
    const tile = 19;
    const corner = vertices.find((v) => v.id >= 54 && v.tiles.includes(tile))!;
    const game = newGame(1);
    game.players[0].settlements = [corner.id];
    game.players[0].hand = { wood: 0, brick: 0, wheat: 0, ore: 0, sheep: 0 };
    const rolled = transition(game, {
      type: "roll",
      total: defaultBoard[tile].number!,
    });
    expect(rolled.players[0].hand.wood).toBe(1);
    expect(
      parseResumableGame(JSON.stringify(rolled))?.players[0].settlements,
    ).toEqual([corner.id]);
  });
});
