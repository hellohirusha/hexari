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
  it("calculates production from the actual 19-tile board", () => {
    const [first, second] = startingProduction();
    expect(first.corner).not.toBe(second.corner);
    expect(vertices[first.corner].neighbors).not.toContain(second.corner);
    for (const start of [first, second]) {
      const tiles = vertices[start.corner].tiles.map(
        (index) => defaultBoard[index],
      );
      expect(start.resources).toEqual(tiles.map((tile) => tile.resource));
      expect(start.pips).toBe(
        tiles.reduce((sum, tile) => sum + (pips[tile.number ?? 0] ?? 0), 0),
      );
    }
  });
  it("repeats a game exactly for a given seed", () => {
    const first = studyGame(42);
    const second = studyGame(42);
    // Match identifiers are unique metadata, independent of the seeded game.
    delete first.game.matchId;
    delete second.game.matchId;
    expect(first).toEqual(second);
  });
  it("uses legal engine actions through multiple complete automated games", () => {
    const games = Array.from({ length: 100 }, (_, i) => studyGame(i + 1));
    for (const { game, turns } of games) {
      expect(game.phase).toBe("end");
      expect(game.winner === 0 || game.winner === 1).toBe(true);
      expect(totalPoints(game, game.winner as 0 | 1)).toBeGreaterThanOrEqual(5);
      expect(turns).toBeLessThan(1000);
      for (const player of game.players)
        for (const resource of goods) {
          expect(Number.isInteger(player.hand[resource])).toBe(true);
          expect(player.hand[resource]).toBeGreaterThanOrEqual(0);
        }
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
