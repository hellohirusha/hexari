import { pips, vertices, type Port, type Tile } from "../../shared/board";
import {
  emptyHand,
  goods,
  type Goods,
  type Hand,
} from "../../shared/resources";
import { production } from "./analysis";

export type TradeGoal =
  "balanced" | "road" | "settlement" | "city" | "development";
export const goalCosts: Record<TradeGoal, Partial<Hand>> = {
  balanced: {},
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
  city: { wheat: 2, ore: 3 },
  development: { wheat: 1, ore: 1, sheep: 1 },
};

export function personalProduction(
  board: Tile[],
  settlements: number[],
  cities: number[],
): Hand {
  const rates = emptyHand();
  for (const [corners, multiplier] of [
    [settlements, 1],
    [cities, 2],
  ] as const)
    for (const corner of corners)
      for (const index of vertices[corner]?.tiles ?? []) {
        const tile = board[index];
        if (tile && tile.resource !== "desert" && tile.number !== null)
          rates[tile.resource] += (multiplier * (pips[tile.number] ?? 0)) / 36;
      }
  return rates;
}

export function getBankRates(
  ports: Port[],
  ownedCorners: number[],
  genericRate: 3 | 4,
  specialPort?: Goods,
): Record<Goods, 2 | 3 | 4> {
  const accessible = ports.filter(
    (p) =>
      ownedCorners.includes(p.vertex) ||
      (p.otherVertex !== undefined && ownedCorners.includes(p.otherVertex)),
  );
  return Object.fromEntries(
    goods.map((g) => [
      g,
      g === specialPort || accessible.some((p) => p.resource === g)
        ? 2
        : genericRate === 3 || accessible.some((p) => p.resource === "any")
          ? 3
          : 4,
    ]),
  ) as Record<Goods, 2 | 3 | 4>;
}

export function evaluateTrade({
  board,
  hand,
  give,
  receive,
  settlements,
  cities,
  goal,
  bankRates,
}: {
  board: Tile[];
  hand: Hand;
  give: Hand;
  receive: Hand;
  settlements: number[];
  cities: number[];
  goal: TradeGoal;
  bankRates: Record<Goods, 2 | 3 | 4>;
}) {
  const hasPersonal = settlements.length + cities.length > 0;
  const boardRates = production(board);
  const ownRates = personalProduction(board, settlements, cities);
  // A small board-wide component prevents zero production implying infinite value.
  const rates = Object.fromEntries(
    goods.map((g) => [
      g,
      hasPersonal ? ownRates[g] + boardRates[g] * 0.2 : boardRates[g],
    ]),
  ) as Hand;
  const mean = goods.reduce((sum, g) => sum + rates[g], 0) / goods.length;
  const cost = goalCosts[goal];
  const values = Object.fromEntries(
    goods.map((g) => {
      const scarcity = Math.min(
        3,
        Math.max(0.4, mean / Math.max(rates[g], 1 / 36)),
      );
      const needed = Math.max(0, (cost[g] ?? 0) - hand[g]);
      const importance =
        needed > 0
          ? 1.4
          : goal !== "balanced" && hand[g] > (cost[g] ?? 0)
            ? 0.85
            : 1;
      return [g, scarcity * importance];
    }),
  ) as Hand;
  const offerCount = goods.reduce((sum, g) => sum + give[g], 0);
  const wantedCount = goods.reduce((sum, g) => sum + receive[g], 0);
  const invalid = goods.some(
    (g) =>
      !Number.isSafeInteger(hand[g]) ||
      !Number.isSafeInteger(give[g]) ||
      !Number.isSafeInteger(receive[g]) ||
      hand[g] < 0 ||
      give[g] < 0 ||
      receive[g] < 0 ||
      give[g] > hand[g] ||
      (give[g] > 0 && receive[g] > 0),
  );
  const givenValue = goods.reduce((sum, g) => sum + give[g] * values[g], 0);
  const receivedValue = goods.reduce(
    (sum, g) => sum + receive[g] * values[g],
    0,
  );
  const ratio = givenValue > 0 ? receivedValue / givenValue : 0;
  const after = Object.fromEntries(
    goods.map((g) => [g, hand[g] - give[g] + receive[g]]),
  ) as Hand;
  const deficit = (state: Hand) =>
    goods.reduce((sum, g) => sum + Math.max(0, (cost[g] ?? 0) - state[g]), 0);
  const creditsByResource = Object.fromEntries(
    goods.map((g) => [g, Math.floor(give[g] / bankRates[g])]),
  ) as Hand;
  const credits = goods.reduce((sum, g) => sum + creditsByResource[g], 0);
  const bankCanMatch =
    wantedCount > 0 &&
    credits >= wantedCount &&
    goods.every((g) => receive[g] <= credits - creditsByResource[g]);
  const giveKinds = goods.filter((g) => give[g] > 0);
  const bankEquivalent =
    giveKinds.length === 1 && wantedCount > 0
      ? { resource: giveKinds[0], cards: bankRates[giveKinds[0]] * wantedCount }
      : null;
  // Vary one offered resource at a time and hold the other cards fixed.
  // The "close" band is 80%-120% of the requested cards' estimated value.
  const fairRanges =
    wantedCount > 0
      ? giveKinds.map((resource) => {
          const fixedValue = givenValue - give[resource] * values[resource];
          const min = Math.max(
            giveKinds.length === 1 ? 1 : 0,
            Math.ceil(
              (receivedValue * 0.8 - fixedValue) / values[resource] - 1e-10,
            ),
          );
          const max = Math.floor(
            (receivedValue * 1.2 - fixedValue) / values[resource] + 1e-10,
          );
          return { resource, min, max };
        })
      : [];
  return {
    invalid,
    ready: !invalid && offerCount > 0 && wantedCount > 0,
    ownRates,
    hasPersonal,
    values,
    givenValue,
    receivedValue,
    ratio,
    bankCanMatch,
    bankEquivalent,
    credits,
    deficitBefore: deficit(hand),
    deficitAfter: invalid ? null : deficit(after),
    fairRanges,
    verdict: ratio > 1.25 ? "Favorable" : ratio >= 1 / 1.2 ? "Close" : "Costly",
  };
}
