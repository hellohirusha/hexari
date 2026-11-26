import { describe, expect, it } from "vitest";
import { centers, defaultBoard, vertices } from "../src/forge/board";
import { newGame, transition } from "../src/forge/engine";
import { parseResumableGame } from "../src/forge/savedGame";

describe("Forge board", () => {
  it("forms a complete radius-two hexagon with connected corners", () => {
    expect(centers).toHaveLength(19);
    expect(defaultBoard).toHaveLength(19);
    expect(vertices).toHaveLength(54);
    for (let r = -2; r <= 2; r++) {
      expect(
        centers.filter((center) => Math.abs(center.y - r * 1.5) < 0.001),
      ).toHaveLength(5 - Math.abs(r));
    }
    for (let tile = 0; tile < 19; tile++) {
      const corners = vertices.filter((v) => v.tiles.includes(tile));
      expect(corners).toHaveLength(6);
      expect(corners.some((v) => v.tiles.some((t) => t !== tile))).toBe(true);
    }
    for (const vertex of vertices)
      for (const neighbor of vertex.neighbors)
        expect(vertices[neighbor].neighbors).toContain(vertex.id);
  });

  it("produces resources on the board and saves a valid corner", () => {
    const tile = defaultBoard.findIndex((t) => t.resource === "wood");
    const corner = vertices.find((v) => v.tiles.includes(tile))!;
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
