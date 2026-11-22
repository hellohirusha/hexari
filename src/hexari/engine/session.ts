import { goods, type Goods, type Hand } from "../../shared/resources";

export type TrackedPlayer = {
  name: string;
  corners: string;
  cities?: number[];
  hand: Hand;
};
export type SessionEvent =
  | {
      type: "build";
      player: number;
      building: "road" | "settlement" | "city" | "development";
      corner?: number;
    }
  | { type: "steal"; player: number; other: number; resource: Goods }
  | { type: "discard"; player: number; cards: Hand }
  | { type: "monopoly"; player: number; resource: Goods }
  | { type: "yearOfPlenty"; player: number; cards: Hand }
  | {
      type: "bundleTrade";
      player: number;
      other: number | null;
      give: Hand;
      receive: Hand;
    }
  | {
      type: "trade";
      player: number;
      other: number;
      give: Goods;
      receive: Goods;
      giveCount?: number;
      receiveCount?: number;
    };

const costs: Record<
  Extract<SessionEvent, { type: "build" }>["building"],
  Partial<Hand>
> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
  city: { wheat: 2, ore: 3 },
  development: { wheat: 1, ore: 1, sheep: 1 },
};

export function applySessionEvent(
  players: TrackedPlayer[],
  event: SessionEvent,
): { players: TrackedPlayer[]; error?: string } {
  if (!Number.isInteger(event.player) || !players[event.player])
    return { players, error: "Choose a valid player." };
  const next = players.map((p) => ({ ...p, hand: { ...p.hand } }));
  const actor = next[event.player].hand;
  if (event.type === "build") {
    if (!Object.hasOwn(costs, event.building))
      return { players, error: "Choose a valid building." };
    const cost = costs[event.building];
    if (goods.some((g) => actor[g] < (cost[g] ?? 0)))
      return {
        players,
        error:
          "The tracked total is too low for this build. Update the estimate before logging it.",
      };
    for (const g of goods) actor[g] -= cost[g] ?? 0;
  } else if (event.type === "discard" || event.type === "yearOfPlenty") {
    if (
      !event.cards ||
      !goods.every(
        (g) =>
          Number.isSafeInteger(event.cards[g]) &&
          event.cards[g] >= 0 &&
          event.cards[g] <= 99,
      ) ||
      !goods.some((g) => event.cards[g] > 0) ||
      (event.type === "yearOfPlenty" &&
        goods.reduce((sum, g) => sum + event.cards[g], 0) !== 2) ||
      (event.type === "discard" && goods.some((g) => actor[g] < event.cards[g]))
    )
      return { players, error: "Enter valid cards for this action." };
    for (const g of goods)
      actor[g] += event.type === "discard" ? -event.cards[g] : event.cards[g];
  } else if (event.type === "monopoly") {
    if (!goods.includes(event.resource))
      return { players, error: "Choose a valid resource." };
    for (const [index, participant] of next.entries()) {
      if (index !== event.player) {
        actor[event.resource] += participant.hand[event.resource];
        participant.hand[event.resource] = 0;
      }
    }
  } else if (event.type === "bundleTrade") {
    const other = event.other === null ? null : next[event.other]?.hand;
    if (
      event.other !== null &&
      (!Number.isInteger(event.other) || event.other === event.player || !other)
    )
      return { players, error: "Choose two different players." };
    const valid = goods.every(
      (g) =>
        Number.isSafeInteger(event.give?.[g]) &&
        event.give[g] >= 0 &&
        event.give[g] <= 99 &&
        Number.isSafeInteger(event.receive?.[g]) &&
        event.receive[g] >= 0 &&
        event.receive[g] <= 99 &&
        !(event.give[g] && event.receive[g]),
    );
    if (
      !valid ||
      !goods.some((g) => event.give[g] > 0) ||
      !goods.some((g) => event.receive[g] > 0)
    )
      return { players, error: "Enter valid, different cards on both sides." };
    if (
      goods.some(
        (g) =>
          actor[g] < event.give[g] || (other && other[g] < event.receive[g]),
      )
    )
      return { players, error: "A tracked hand cannot afford this trade." };
    for (const g of goods) {
      actor[g] += event.receive[g] - event.give[g];
      if (other) other[g] += event.give[g] - event.receive[g];
    }
  } else {
    if (
      !Number.isInteger(event.other) ||
      event.other === event.player ||
      !next[event.other]
    )
      return { players, error: "Choose two different players." };
    const other = next[event.other].hand;
    if (event.type === "steal") {
      if (!goods.includes(event.resource))
        return { players, error: "Choose a valid resource." };
      if (other[event.resource] < 1)
        return {
          players,
          error:
            "The tracked total is too low for this steal. Update the estimate first.",
        };
      other[event.resource]--;
      actor[event.resource]++;
    } else {
      if (!goods.includes(event.give) || !goods.includes(event.receive))
        return { players, error: "Choose valid trade resources." };
      const giveCount = event.giveCount ?? 1;
      const receiveCount = event.receiveCount ?? 1;
      if (
        !Number.isSafeInteger(giveCount) ||
        giveCount < 1 ||
        giveCount > 99 ||
        !Number.isSafeInteger(receiveCount) ||
        receiveCount < 1 ||
        receiveCount > 99
      )
        return { players, error: "Enter valid trade quantities." };
      if (event.give === event.receive)
        return { players, error: "Choose different resources for the trade." };
      if (actor[event.give] < giveCount || other[event.receive] < receiveCount)
        return {
          players,
          error:
            "A tracked total is too low for this trade. Update the estimates first.",
        };
      actor[event.give] -= giveCount;
      other[event.give] += giveCount;
      other[event.receive] -= receiveCount;
      actor[event.receive] += receiveCount;
    }
  }
  return { players: next };
}
