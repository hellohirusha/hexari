import { pips } from "../shared/board";
import { defaultBoard, vertices } from "./board";
import { placementSound } from "./placementSound";
import {
  goods,
  legalRoad,
  legalSettlement,
  bankRate,
  longestRoadLength,
  bestSetupSettlement,
  legalSetupSettlement,
  setupNeedsRoad,
  legalSetupRoad,
  transition,
  type Game,
  type Goods,
} from "./engine";

/** Pick a productive opening while keeping a few roads of space from the opponent. */
export function chooseBotSetupSettlement(
  game: Game,
  random: () => number = Math.random,
): number | undefined {
  const occupied = [
    ...game.players[1 - game.turn].settlements,
    ...game.players[1 - game.turn].cities,
  ];
  const distance = new Map<number, number>(occupied.map((id) => [id, 0]));
  const queue = [...occupied];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    for (const neighbor of vertices[at].neighbors) {
      if (distance.has(neighbor)) continue;
      distance.set(neighbor, distance.get(at)! + 1);
      queue.push(neighbor);
    }
  }
  const legal = vertices.filter((vertex) =>
    legalSetupSettlement(game, vertex.id),
  );
  const distant = legal.filter(
    (vertex) => (distance.get(vertex.id) ?? Infinity) >= 3,
  );
  const choices = distant.length ? distant : legal;
  if (!choices.length) return undefined;
  const score = (id: number) =>
    vertices[id].tiles.reduce(
      (sum, tile) => sum + (pips[defaultBoard[tile].number ?? 0] ?? 0),
      0,
    );
  const best = Math.max(...choices.map((vertex) => score(vertex.id)));
  const competitive = choices.filter((vertex) => score(vertex.id) >= best - 2);
  const value = random();
  const index = Math.min(
    competitive.length - 1,
    Math.max(
      0,
      Math.floor((Number.isFinite(value) ? value : 0) * competitive.length),
    ),
  );
  return competitive[index].id;
}

function discardForSeat(game: Game, seat: 0 | 1): Game {
  let state = game;
  while (
    state.phase === "discard" &&
    (state.discardRemaining?.[seat] ?? 0) > 0
  ) {
    const hand = state.players[seat].hand;
    const resource = [...goods]
      .filter((item) => hand[item] > 0)
      .sort((a, b) => hand[b] - hand[a])[0];
    if (!resource) break;
    const next = transition(state, { type: "sevenDiscard", seat, resource });
    if (next === state) break;
    state = next;
  }
  return state;
}

/** Resolve only the bot's own required discards, even on the human's turn. */
export function playBotDiscard(game: Game): Game {
  return discardForSeat(game, 1);
}

/** Favor blocking an opponent's production without blocking the bot's. */
export function chooseBotRobberTile(game: Game): number | undefined {
  const opponent = game.players[1 - game.turn];
  const own = game.players[game.turn];
  const current =
    game.robberTile ??
    defaultBoard.findIndex((tile) => tile.resource === "desert");
  const weight = (tile: number, seat: typeof own) =>
    seat.settlements.filter((corner) => vertices[corner]?.tiles.includes(tile))
      .length +
    2 *
      seat.cities.filter((corner) => vertices[corner]?.tiles.includes(tile))
        .length;
  return defaultBoard
    .map((tile, id) => ({
      id,
      score:
        (weight(id, opponent) * 2 - weight(id, own)) *
          (pips[tile.number ?? 0] ?? 0) +
        (weight(id, opponent) > 0 &&
        goods.some((resource) => opponent.hand[resource] > 0)
          ? 1
          : 0),
    }))
    .filter((tile) => tile.id !== current)
    .sort((a, b) => b.score - a.score || a.id - b.id)[0]?.id;
}

/** A heuristic opponent. Every move goes through the game engine. */
export function playBotTurn(
  game: Game,
  roll: number,
  now: number,
  onAction?: (action: unknown) => void,
  random: () => number = Math.random,
): { game: Game; actions: string[] } {
  if (game.phase === "discard") {
    const next = playBotDiscard(game);
    return {
      game: next,
      actions: next === game ? [] : ["Discarded required cards"],
    };
  }
  if (game.phase === "end" || game.turn !== 1) return { game, actions: [] };
  return playAutomatedTurn(game, roll, now, onAction, random, false);
}

/** The same policy can play either seat for repeatable engine studies. */
export function playAutomatedTurn(
  game: Game,
  roll: number,
  now: number,
  onAction?: (action: unknown) => void,
  setupRandom?: () => number,
  manageBothDiscards = true,
): { game: Game; actions: string[] } {
  if (game.phase === "end") return { game, actions: [] };
  if (game.phase === "setup") {
    if (setupNeedsRoad(game)) {
      const at = game.players[game.turn].settlements[0];
      const to = vertices[at].neighbors.find((neighbor) =>
        legalSetupRoad(game, at, neighbor),
      );
      if (to === undefined) return { game, actions: [] };
      const next = transition(game, {
        type: "build",
        building: "road",
        at,
        to,
        now,
      });
      if (next === game) return { game, actions: [] };
      onAction?.({
        type: "build",
        actor: game.turn,
        building: "road",
        setup: true,
      });
      return { game: next, actions: ["Placed starting road"] };
    }
    const at = setupRandom
      ? chooseBotSetupSettlement(game, setupRandom)
      : bestSetupSettlement(game);
    if (at === undefined) return { game, actions: [] };
    const next = transition(game, {
      type: "build",
      building: "settlement",
      at,
      now,
    });
    if (next === game) return { game, actions: [] };
    onAction?.({
      type: "build",
      actor: game.turn,
      building: "settlement",
      setup: true,
    });
    return {
      game: next,
      actions: [`Placed starting settlement at corner ${at + 1}`],
    };
  }
  let state =
    game.phase === "roll"
      ? transition(game, { type: "roll", total: roll })
      : game;
  const actions: string[] =
    game.phase === "roll" && state !== game ? [`Rolled ${roll}`] : [];
  if (state.phase === "discard") {
    const before = state;
    state = discardForSeat(state, game.turn);
    if (manageBothDiscards)
      state = discardForSeat(state, (1 - game.turn) as 0 | 1);
    if (state !== before) actions.push("Discarded required cards");
  }
  if (state.phase === "robber") {
    const tile = chooseBotRobberTile(state);
    if (tile !== undefined) {
      const next = transition(state, {
        type: "moveRobber",
        tile,
        random: setupRandom?.() ?? 0.5,
      });
      if (next !== state) {
        state = next;
        actions.push("Moved the robber");
      }
    }
  }
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
      // Save resources for a settlement once the road network reaches a
      // legal location. In particular, trade for sheep if none is produced
      // by the starting position rather than spending every road piece.
      const settlementLocation = vertices.some((v) =>
        legalSettlement(state, v.id),
      );
      const needs: Goods[] = settlementLocation
        ? ["wood", "brick", "wheat", "sheep"]
        : ["wood", "brick"];
      const receive = needs.find((resource) => player.hand[resource] === 0);
      const give = goods.find(
        (resource) =>
          resource !== receive && player.hand[resource] >= bankRate(),
      );
      if (give && receive) {
        next = transition(state, { type: "bank", give, receive });
        label = "Traded with the bank";
      }
    }
    if (next === state) break;
    const piece = placementSound(state, next);
    if (piece)
      onAction?.({
        type: "build",
        actor: state.turn,
        building: piece,
        setup: false,
      });
    else if (label === "Traded with the bank") {
      const before = state.players[state.turn].hand;
      const after = next.players[state.turn].hand;
      const give = goods.find((resource) => after[resource] < before[resource]);
      const receive = goods.find(
        (resource) => after[resource] > before[resource],
      );
      if (give && receive)
        onAction?.({ type: "bank", actor: state.turn, give, receive });
    }
    state = next;
    actions.push(label);
  }
  if (state.phase === "build" && state.turn === game.turn) {
    state = transition(state, { type: "endTurn", now });
    actions.push("Ended turn");
  }
  return { game: state, actions };
}
