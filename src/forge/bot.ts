import { pips } from "../shared/board";
import { defaultBoard, vertices } from "./board";
import {
  goods,
  legalRoad,
  legalSettlement,
  bankRate,
  longestRoadLength,
  bestSetupSettlement,
  transition,
  type Game,
  type Goods,
} from "./engine";

/** A small, deterministic heuristic opponent. Every move goes through the game engine. */
export function playBotTurn(
  game: Game,
  roll: number,
  now: number,
): { game: Game; actions: string[] } {
  if (game.phase === "end" || game.turn !== 1) return { game, actions: [] };
  return playAutomatedTurn(game, roll, now);
}

/** The same policy can play either seat for repeatable engine studies. */
export function playAutomatedTurn(
  game: Game,
  roll: number,
  now: number,
): { game: Game; actions: string[] } {
  if (game.phase === "end") return { game, actions: [] };
  if (game.phase === "setup") {
    const at = bestSetupSettlement(game);
    if (at === undefined) return { game, actions: [] };
    return {
      game: transition(game, {
        type: "build",
        building: "settlement",
        at,
        now,
      }),
      actions: [`Placed starting settlement at corner ${at + 1}`],
    };
  }
  let state =
    game.phase === "roll"
      ? transition(game, { type: "roll", total: roll })
      : game;
  const actions: string[] =
    game.phase === "roll" && state !== game ? [`Rolled ${roll}`] : [];
  if (game.phase === "roll" && state !== game && roll === 7)
    actions.push("A 7 grants supply to each player with room");
  for (let i = 0; i < 12 && state.phase === "build"; i++) {
    const player = state.players[state.turn];
    let next = state;
    let label = "";
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
      label = "Upgraded a city";
      if (next.winner !== state.turn) {
        next = state;
        label = "";
      }
    }
    // Check for an immediate win, including the longest-road award.
    if (next === state && player.hand.wood && player.hand.brick) {
      const edges = vertices.flatMap((v) =>
        v.neighbors
          .filter((id) => v.id < id && legalRoad(state, v.id, id))
          .map((id) => [v.id, id] as const),
      );
      for (const [a, b] of edges) {
        const trial = transition(state, {
          type: "build",
          building: "road",
          at: a,
          to: b,
          now,
        });
        if (trial.winner === state.turn) {
          next = trial;
          label = "Built a road";
          break;
        }
      }
      if (next === state && player.hand.wheat && player.hand.sheep) {
        for (const corner of vertices) {
          if (!legalSettlement(state, corner.id)) continue;
          const trial = transition(state, {
            type: "build",
            building: "settlement",
            at: corner.id,
            now,
          });
          if (trial.winner === state.turn) {
            next = trial;
            label = `Built at corner ${corner.id + 1}`;
            break;
          }
        }
      }
    }
    if (
      next === state &&
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
      label = "Upgraded a city";
    }
    if (
      next === state &&
      player.hand.wood &&
      player.hand.brick &&
      player.hand.wheat &&
      player.hand.sheep
    ) {
      const corner = vertices.find((v) => legalSettlement(state, v.id));
      if (corner) {
        next = transition(state, {
          type: "build",
          building: "settlement",
          at: corner.id,
          now,
        });
        label = `Built at corner ${corner.id + 1}`;
      }
    }
    if (
      next === state &&
      player.hand.wood &&
      player.hand.brick &&
      (!vertices.some((v) => legalSettlement(state, v.id)) ||
        !player.hand.wheat ||
        !player.hand.sheep)
    ) {
      const options = vertices.flatMap((v) =>
        v.neighbors
          .filter((id) => legalRoad(state, v.id, id))
          .map((id) => ({ a: v.id, b: id })),
      );
      const scored = options
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
          return {
            trial,
            score:
              score +
              longestRoadLength(
                trial.players[state.turn],
                trial.players[1 - state.turn],
              ),
            road,
          };
        })
        .sort((a, b) => b.score - a.score);
      if (scored.length) {
        next = scored[0].trial;
        label = "Built a road";
      }
    }
    if (next === state) {
      const give = goods.find((g) => player.hand[g] >= bankRate());
      const receive: Goods =
        player.hand.wood === 0
          ? "wood"
          : player.hand.brick === 0
            ? "brick"
            : player.hand.wheat < 2
              ? "wheat"
              : "ore";
      if (give && give !== receive) {
        next = transition(state, { type: "bank", give, receive });
        label = "Traded with the bank";
      }
    }
    if (
      next === state &&
      goods.reduce((sum, g) => sum + player.hand[g], 0) >= 7
    ) {
      const discard = [...goods]
        .filter((g) => player.hand[g] > 0)
        .sort((a, b) => player.hand[a] - player.hand[b])[0];
      next = transition(state, { type: "discard", resource: discard });
      label = "Discarded a card";
    }
    if (next === state) break;
    state = next;
    actions.push(label);
  }
  if (state.phase !== "end" && state.turn === game.turn) {
    state = transition(state, { type: "endTurn", now });
    actions.push("Ended turn");
  }
  return { game: state, actions };
}
