import { yieldForRoll } from "./analysis";
import { initialBelief, unknownSteal, type Hypothesis } from "./belief";
import type { Tile } from "../../shared/board";
import { vertices } from "../../shared/board";
import { goods, type Hand } from "../../shared/resources";
import {
  applySessionEvent,
  type SessionEvent,
  type TrackedPlayer,
} from "./session";

export type LiveEvent =
  | SessionEvent
  | { type: "unknownSteal"; player: number; other: number }
  | { type: "handCorrection"; player: number; hand: Hand }
  | { type: "roll"; number: number };
export type LiveSession = {
  players: TrackedPlayer[];
  worlds: Hypothesis[];
  rolls: number[];
  history: string[];
  board?: Tile[];
};

export function startSession(
  players: TrackedPlayer[],
  board?: Tile[],
): LiveSession | null {
  if (board && board.length !== 19) return null;
  if (
    players.length < 2 ||
    players.length > 4 ||
    players.some((p) => !p.name.trim() || parseCorners(p.corners) === null)
  )
    return null;
  const occupied = players.flatMap((p) => [
    ...(parseCorners(p.corners) ?? []),
    ...(p.cities ?? []),
  ]);
  if (
    occupied.some((id) => !Number.isInteger(id) || !vertices[id]) ||
    new Set(occupied).size !== occupied.length ||
    occupied.some((id) =>
      vertices[id].neighbors.some((neighbor) => occupied.includes(neighbor)),
    )
  )
    return null;
  const worlds = initialBelief(players.map((p) => p.hand));
  return worlds.length
    ? {
        players: players.map((p) => ({
          ...p,
          cities: [...(p.cities ?? [])],
          hand: { ...p.hand },
        })),
        worlds,
        rolls: [],
        history: [],
        ...(board ? { board: board.map((tile) => ({ ...tile })) } : {}),
      }
    : null;
}

/** Corner labels shown in the UI are one-based; game geometry is zero-based. */
export function parseCorners(value: string): number[] | null {
  if (!value.trim()) return [];
  const tokens = value.split(",").map((s) => s.trim());
  if (tokens.some((s) => !/^\d+$/.test(s))) return null;
  const result = tokens.map((s) => Number(s) - 1);
  return result.every((id) => Number.isSafeInteger(id) && !!vertices[id]) &&
    new Set(result).size === result.length
    ? result
    : null;
}

export function recordLiveEvent(
  session: LiveSession,
  event: LiveEvent,
  board: Tile[],
): LiveSession | null {
  let worlds: Hypothesis[] | null;
  let description: string;
  let rolls = session.rolls;
  let players = session.players;
  if (event.type === "roll") {
    if (
      !Number.isInteger(event.number) ||
      event.number < 2 ||
      event.number > 12
    )
      return null;
    const gains = session.players.map((p) =>
      yieldForRoll(
        session.board ?? board,
        [
          ...(parseCorners(p.corners) ?? []),
          ...(p.cities ?? []),
          ...(p.cities ?? []),
        ],
        event.number,
      ),
    );
    worlds = session.worlds.map((world) => ({
      ...world,
      hands: world.hands.map((hand, i) => ({
        wood: hand.wood + gains[i].wood,
        brick: hand.brick + gains[i].brick,
        wheat: hand.wheat + gains[i].wheat,
        ore: hand.ore + gains[i].ore,
        sheep: hand.sheep + gains[i].sheep,
      })),
    }));
    description = `Rolled ${event.number}`;
    rolls = [...rolls, event.number];
  } else if (event.type === "unknownSteal") {
    worlds = unknownSteal(session.worlds, event.player, event.other);
    description = `${session.players[event.player]?.name} stole an unknown card from ${session.players[event.other]?.name}`;
  } else if (event.type === "handCorrection") {
    if (
      !session.players[event.player] ||
      !event.hand ||
      !goods.every(
        (g) => Number.isSafeInteger(event.hand[g]) && event.hand[g] >= 0,
      )
    )
      return null;
    const combined = new Map<string, Hypothesis>();
    for (const world of session.worlds) {
      const hands = world.hands.map((hand, index) =>
        index === event.player ? { ...event.hand } : { ...hand },
      );
      const key = JSON.stringify(hands);
      const previous = combined.get(key);
      if (previous) previous.probability += world.probability;
      else combined.set(key, { hands, probability: world.probability });
    }
    worlds = [...combined.values()];
    description = `${session.players[event.player].name}'s hand was corrected`;
  } else {
    if (
      event.type === "build" &&
      (event.building === "settlement" || event.building === "city")
    ) {
      const actor = session.players[event.player];
      const corner = event.corner;
      if (
        !actor ||
        corner === undefined ||
        !Number.isInteger(corner) ||
        !vertices[corner]
      )
        return null;
      const settlements = parseCorners(actor.corners);
      if (!settlements) return null;
      if (event.building === "city") {
        if (!settlements.includes(corner)) return null;
        players = session.players.map((p, i) =>
          i === event.player
            ? {
                ...p,
                corners: settlements
                  .filter((id) => id !== corner)
                  .map((id) => id + 1)
                  .join(", "),
                cities: [...(p.cities ?? []), corner],
              }
            : p,
        );
      } else {
        const occupied = session.players.flatMap((p) => [
          ...(parseCorners(p.corners) ?? []),
          ...(p.cities ?? []),
        ]);
        if (
          occupied.includes(corner) ||
          vertices[corner].neighbors.some((id) => occupied.includes(id))
        )
          return null;
        players = session.players.map((p, i) =>
          i === event.player
            ? {
                ...p,
                corners: [...settlements, corner]
                  .map((id) => id + 1)
                  .join(", "),
              }
            : p,
        );
      }
    }
    const possible = session.worlds.flatMap((world) => {
      const result = applySessionEvent(
        session.players.map((p, i) => ({ ...p, hand: world.hands[i] })),
        event,
      );
      return result.error
        ? []
        : [
            {
              hands: result.players.map((p) => p.hand),
              probability: world.probability,
            },
          ];
    });
    const total = possible.reduce((sum, world) => sum + world.probability, 0);
    worlds = total
      ? possible.map((world) => ({
          ...world,
          probability: world.probability / total,
        }))
      : null;
    const describeBundle = (hand: Hand) =>
      goods
        .filter((g) => hand[g] > 0)
        .map((g) => `${hand[g]} ${g}`)
        .join(", ");
    description =
      event.type === "build"
        ? `${session.players[event.player]?.name} built ${event.building}${event.corner === undefined ? "" : ` at corner ${event.corner + 1}`}`
        : event.type === "bundleTrade"
          ? `${session.players[event.player]?.name} traded ${describeBundle(event.give)} for ${describeBundle(event.receive)} with ${event.other === null ? "the bank" : session.players[event.other]?.name}`
          : event.type === "trade"
            ? `${session.players[event.player]?.name} traded ${event.giveCount ?? 1} ${event.give} for ${event.receiveCount ?? 1} ${event.receive} with ${session.players[event.other]?.name}`
            : `${session.players[event.player]?.name} stole ${event.resource} from ${session.players[event.other]?.name}`;
  }
  return worlds
    ? {
        ...session,
        players,
        worlds,
        rolls,
        history: [description, ...session.history].slice(0, 100),
      }
    : null;
}
