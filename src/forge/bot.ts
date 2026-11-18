import { pips } from "../shared/board";
import { defaultBoard, vertices } from "./board";
import {
  goods,
  legalRoad,
  legalSettlement,
  legalImprovement,
  bankRate,
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
  let state =
    game.phase === "roll"
      ? transition(game, { type: "roll", total: roll })
      : game;
  const actions: string[] =
    game.phase === "roll" && state !== game ? [`Rolled ${roll}`] : [];
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
    }
    if (
      next === state &&
      player.hand.wood >= 2 &&
      player.hand.brick >= 1 &&
      player.hand.sheep >= 1 &&
      !player.markets?.length
    ) {
      const corner = [...player.settlements, ...player.cities].find((id) =>
        legalImprovement(state, "market", id),
      );
      if (corner !== undefined) {
        next = transition(state, {
          type: "build",
          building: "market",
          at: corner,
          now,
        });
        label = "Built a market";
      }
    }
    if (
      next === state &&
      player.hand.wood &&
      player.hand.brick &&
      player.hand.wheat
    ) {
      const corner = [...player.settlements, ...player.cities].find((id) =>
        legalImprovement(state, "farm", id),
      );
      if (corner !== undefined) {
        next = transition(state, {
          type: "build",
          building: "farm",
          at: corner,
          now,
        });
        label = "Built a farm";
      }
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
      !vertices.some((v) => legalSettlement(state, v.id))
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
          return { trial, score, road };
        })
        .sort((a, b) => b.score - a.score);
      if (scored.length) {
        next = scored[0].trial;
        label = "Built a road";
      }
    }
    if (next === state) {
      const give = goods.find((g) => player.hand[g] >= bankRate(player));
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
