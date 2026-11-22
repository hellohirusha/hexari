import { describe, expect, it } from "vitest";
import { goods, totalPoints } from "../src/forge/engine";
import { startingProduction, studyGame } from "../src/forge/study";
import { defaultBoard, vertices } from "../src/forge/board";
import { pips } from "../src/shared/board";

describe("Forge fixed-board study", () => {
  it("reports each starting position and its expected production", () => {
    const starts = startingProduction();
    expect(starts).toHaveLength(2);
    for (const start of starts) {
      expect(start.pips).toBeGreaterThan(0);
      expect(start.expectedCardsPerRoll).toBe(start.pips / 36);
    }
  });
  it("finds matching opening resource distributions", () => {
    const candidates = vertices
      .filter((v) => v.tiles.length === 3)
      .flatMap((v) =>
        vertices
          .filter(
            (other) =>
              other.id > v.id &&
              !v.neighbors.includes(other.id) &&
              other.tiles.length === 3,
          )
          .filter((other) => {
            const signature = (id: number) =>
              vertices[id].tiles
                .map(
                  (tile) =>
                    `${defaultBoard[tile].resource}:${pips[defaultBoard[tile].number ?? 0] ?? 0}`,
                )
                .sort()
                .join(",");
            return signature(v.id) === signature(other.id);
          })
          .map((other) => [v.id, other.id]),
      );
    expect(candidates).toContainEqual([23, 38]);
  });
  it("repeats a game exactly for a given seed", () => {
    expect(studyGame(42)).toEqual(studyGame(42));
  });
  it("uses legal engine actions through multiple complete automated games", () => {
    const games = Array.from({ length: 100 }, (_, i) => studyGame(i + 1));
    for (const { game, turns } of games) {
      expect(game.phase).toBe("end");
      expect(game.winner === 0 || game.winner === 1).toBe(true);
      expect(totalPoints(game, game.winner as 0 | 1)).toBeGreaterThanOrEqual(5);
      expect(turns).toBeLessThan(1000);
      for (const player of game.players)
        expect(
          goods.reduce((sum, resource) => sum + player.hand[resource], 0),
        ).toBeLessThanOrEqual(7);
    }
    const swapped = Array.from({ length: 100 }, (_, i) =>
      studyGame(i + 1, 1000, true),
    );
    const candidate = Array.from({ length: 100 }, (_, i) =>
      studyGame(i + 1, 1000, false, [8, 41]),
    );
    const candidateSwapped = Array.from({ length: 100 }, (_, i) =>
      studyGame(i + 1, 1000, true, [8, 41]),
    );
    const summary = (results: typeof games) => ({
      wins: [0, 1].map(
        (seat) => results.filter(({ game }) => game.winner === seat).length,
      ),
      minTurns: Math.min(...results.map(({ turns }) => turns)),
      maxTurns: Math.max(...results.map(({ turns }) => turns)),
      averageTurns:
        results.reduce((sum, game) => sum + game.turns, 0) / results.length,
    });
    console.info(
      "Forge study",
      JSON.stringify({
        starts: startingProduction(),
        newStarts: summary(games),
        newStartsSwapped: summary(swapped),
        oldStarts: summary(candidate),
        oldStartsSwapped: summary(candidateSwapped),
      }),
    );
  }, 90000);
});
