import { yieldForRoll } from "./analysis";
import { initialBelief, unknownSteal, type Hypothesis } from "./belief";
import type { Port, Tile } from "../../shared/board";
import { vertices } from "../../shared/board";
import { goods, type Hand } from "../../shared/resources";
import { getBankRates } from "./tradeCalculator";
import {
  applySessionEvent,
  type SessionEvent,
  type TrackedPlayer,
} from "./session";

export type LiveEvent =
  | SessionEvent
  | { type: "unknownSteal"; player: number; other: number }
  | { type: "handCorrection"; player: number; hand: Hand }
  | { type: "moveRobber"; tile: number }
  | { type: "roll"; number: number };
export type LiveSession = {
  players: TrackedPlayer[];
  worlds: Hypothesis[];
  rolls: number[];
  history: string[];
  firstRollTurn?: number;
  board?: Tile[];
  ports?: Port[];
  robberTile?: number | null;
};

export type TrackedPosition = {
  settlements: string;
  cities: string;
  hand: Hand | null;
  turn: number;
  opponents: string;
};

/** Only expose a hand as exact when every remaining hypothesis agrees. */
export function trackedPosition(
  session: LiveSession,
  index: number,
): TrackedPosition | null {
  const player = session.players[index];
  const first = session.worlds[0]?.hands[index];
  if (!player || !first) return null;
  const exact = session.worlds.every(
    (world) =>
      world.hands[index] &&
      goods.every((g) => world.hands[index][g] === first[g]),
  );
  return {
    settlements: player.corners,
    cities: (player.cities ?? []).map((id) => id + 1).join(", "),
    hand: exact ? { ...first } : null,
    turn: (session.firstRollTurn ?? 1) + Math.max(0, session.rolls.length - 1),
    opponents: session.players
      .filter((_, other) => other !== index)
      .map(
        (opponent) =>
          `${opponent.name}: settlements ${opponent.corners || "none"}; cities ${(opponent.cities ?? []).map((id) => id + 1).join(", ") || "none"}`,
      )
      .join(". "),
  };
}

export function startSession(
  players: TrackedPlayer[],
  board?: Tile[],
  ports?: Port[],
  firstRollTurn = 1,
): LiveSession | null {
  if (board && board.length !== 19) return null;
  if (
    !Number.isSafeInteger(firstRollTurn) ||
    firstRollTurn < 1 ||
    firstRollTurn > 1000
  )
    return null;
  const desertIndex =
    board?.findIndex((tile) => tile.resource === "desert") ?? -1;
  if (
    players.length < 2 ||
    players.length > 4 ||
    players.some(
      (player) =>
        !player.hand ||
        !goods.every(
          (g) => Number.isSafeInteger(player.hand[g]) && player.hand[g] >= 0,
        ),
    ) ||
    goods.some(
      (g) =>
        players.reduce((sum, player) => sum + (player.hand?.[g] ?? 0), 0) > 19,
    ) ||
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
        firstRollTurn,
        ...(board ? { board: board.map((tile) => ({ ...tile })) } : {}),
        ...(ports ? { ports: ports.map((port) => ({ ...port })) } : {}),
        robberTile: desertIndex < 0 ? null : desertIndex,
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
  ports: Port[] = [],
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
        session.robberTile,
      ),
    );
    worlds = session.worlds.map((world) => {
      const hands = world.hands.map((hand) => ({ ...hand }));
      for (const resource of goods) {
        const available = Math.max(
          0,
          19 - world.hands.reduce((sum, hand) => sum + hand[resource], 0),
        );
        const recipients = gains
          .map((gain, index) => ({ index, count: gain[resource] }))
          .filter(({ count }) => count > 0);
        const demand = recipients.reduce(
          (sum, recipient) => sum + recipient.count,
          0,
        );
        if (demand <= available) {
          for (const recipient of recipients)
            hands[recipient.index][resource] += recipient.count;
        } else if (recipients.length === 1) {
          hands[recipients[0].index][resource] += available;
        }
      }
      return { ...world, hands };
    });
    description = `Rolled ${event.number}`;
    rolls = [...rolls, event.number];
  } else if (event.type === "moveRobber") {
    if (
      !Number.isInteger(event.tile) ||
      event.tile < 0 ||
      event.tile >= (session.board ?? board).length ||
      event.tile === session.robberTile
    )
      return null;
    return {
      ...session,
      robberTile: event.tile,
      history: [
        `Robber moved to tile ${event.tile + 1}`,
        ...session.history,
      ].slice(0, 100),
    };
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
      if (goods.some((g) => hands.reduce((sum, hand) => sum + hand[g], 0) > 19))
        continue;
      const key = JSON.stringify(hands);
      const previous = combined.get(key);
      if (previous) previous.probability += world.probability;
      else combined.set(key, { hands, probability: world.probability });
    }
    const total = [...combined.values()].reduce(
      (sum, world) => sum + world.probability,
      0,
    );
    worlds = total
      ? [...combined.values()].map((world) => ({
          ...world,
          probability: world.probability / total,
        }))
      : null;
    description = `${session.players[event.player].name}'s hand was corrected`;
  } else {
    if (event.type === "bundleTrade" && event.other === null) {
      const actor = session.players[event.player];
      if (
        !actor ||
        !event.give ||
        !event.receive ||
        !goods.every(
          (g) =>
            Number.isSafeInteger(event.receive[g]) && event.receive[g] >= 0,
        )
      )
        return null;
      const corners = [
        ...(parseCorners(actor.corners) ?? []),
        ...(actor.cities ?? []),
      ];
      const rates = getBankRates(session.ports ?? ports, corners, 4);
      if (
        !goods.every(
          (g) =>
            Number.isSafeInteger(event.give?.[g]) &&
            event.give[g] >= 0 &&
            event.give[g] % rates[g] === 0,
        )
      )
        return null;
      const credits = goods.reduce(
        (sum, g) => sum + event.give[g] / rates[g],
        0,
      );
      if (
        credits !== goods.reduce((sum, g) => sum + (event.receive?.[g] ?? 0), 0)
      )
        return null;
    }
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
      if (
        event.type === "bundleTrade" &&
        event.other === null &&
        goods.some(
          (g) =>
            event.receive[g] >
            19 - world.hands.reduce((sum, hand) => sum + hand[g], 0),
        )
      )
        return [];
      if (
        event.type === "yearOfPlenty" &&
        (!event.cards ||
          goods.some(
            (g) =>
              event.cards[g] >
              19 - world.hands.reduce((sum, hand) => sum + hand[g], 0),
          ))
      )
        return [];
      const result = applySessionEvent(
        session.players.map((p, i) => ({ ...p, hand: world.hands[i] })),
        event,
      );
      // A revealed random steal is more likely in worlds where the victim
      // held more of that resource. Filtering alone gives a biased posterior.
      const victim = event.type === "steal" ? world.hands[event.other] : null;
      const victimTotal = victim
        ? goods.reduce((sum, resource) => sum + victim[resource], 0)
        : 0;
      const likelihood =
        event.type === "steal" && victim && victimTotal > 0
          ? victim[event.resource] / victimTotal
          : 1;
      return result.error
        ? []
        : [
            {
              hands: result.players.map((p) => p.hand),
              probability: world.probability * likelihood,
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
        : event.type === "discard"
          ? `${session.players[event.player]?.name} discarded ${describeBundle(event.cards)}`
          : event.type === "yearOfPlenty"
            ? `${session.players[event.player]?.name} took ${describeBundle(event.cards)} with Year of Plenty`
            : event.type === "monopoly"
              ? `${session.players[event.player]?.name} played Monopoly on ${event.resource}`
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
