import { describe, expect, it } from "vitest";
import { pips } from "../src/shared/board";
import { defaultBoard, vertices } from "../src/forge/board";
import {
  goods,
  legalRoad,
  legalSettlement,
  newGame,
  totalPoints,
  transition,
  type Game,
  type Goods,
} from "../src/forge/engine";

// Deterministic automated players use only the public transition function.
function play(game: Game, roll: number, now: number): Game {
  let state = transition(game, { type: "roll", total: roll });
  for (let action = 0; action < 12 && state.phase === "build"; action++) {
    const player = state.players[state.turn];
    let next = state;
    if (
      player.hand.ore >= 3 &&
      player.hand.wheat >= 2 &&
      player.settlements.length
    ) {
      next = transition(state, {
        type: "build",
        building: "city",
        at: player.settlements[0],
        now,
      });
    } else if (
      player.hand.wood &&
      player.hand.brick &&
      player.hand.wheat &&
      player.hand.sheep
    ) {
      const candidate = vertices.find((vertex) =>
        legalSettlement(state, vertex.id),
      );
      if (candidate)
        next = transition(state, {
          type: "build",
          building: "settlement",
          at: candidate.id,
          now,
        });
    }
    if (
      next === state &&
      player.hand.wood &&
      player.hand.brick &&
      !vertices.some((vertex) => legalSettlement(state, vertex.id))
    ) {
      const roads = vertices.flatMap((vertex) =>
        vertex.neighbors
          .filter((neighbor) => legalRoad(state, vertex.id, neighbor))
          .map((neighbor) => ({ a: vertex.id, b: neighbor })),
      );
      const scored = roads
        .map((road) => {
          const trial = transition(state, {
            type: "build",
            building: "road",
            at: road.a,
            to: road.b,
            now,
          });
          const targets = [road.a, road.b].filter((id) =>
            legalSettlement({ ...trial, turn: state.turn }, id),
          );
          const score = targets.length
            ? Math.max(
                ...targets.map((id) =>
                  vertices[id].tiles.reduce(
                    (sum, tile) =>
                      sum + (pips[defaultBoard[tile].number ?? 0] ?? 0),
                    0,
                  ),
                ),
              )
            : -1;
          return { trial, score };
        })
        .sort((a, b) => b.score - a.score);
      if (scored.length) next = scored[0].trial;
    }
    if (next === state) {
      const give = goods.find((resource) => player.hand[resource] >= 4);
      const receive: Goods =
        player.hand.wood === 0
          ? "wood"
          : player.hand.brick === 0
            ? "brick"
            : player.hand.wheat < 2
              ? "wheat"
              : "ore";
      if (give && give !== receive)
        next = transition(state, { type: "bank", give, receive });
    }
    if (
      next === state &&
      goods.reduce((sum, resource) => sum + player.hand[resource], 0) >= 7
    ) {
      const discard = [...goods]
        .filter((resource) => player.hand[resource] > 0)
        .sort((a, b) => player.hand[a] - player.hand[b])[0];
      next = transition(state, { type: "discard", resource: discard });
    }
    if (next === state) break;
    state = next;
  }
  return state.phase === "end" || state.turn !== game.turn
    ? state
    : transition(state, { type: "endTurn", now });
}

describe("Forge complete game", () => {
  it.each([7831, 2026, 17])(
    "reaches a five-point winner with seeded dice %i",
    (initialSeed) => {
      let game = newGame(0);
      let seed = initialSeed;
      let turns = 0;
      const die = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed % 6) + 1;
      };
      while (game.phase !== "end" && turns < 1000) {
        game = play(game, die() + die(), ++turns * 1000);
      }
      expect(game.phase, JSON.stringify(game.players)).toBe("end");
      expect(game.winner).not.toBeNull();
      expect(totalPoints(game, game.winner as 0 | 1)).toBeGreaterThanOrEqual(5);
    },
  );
});
