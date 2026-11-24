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
  const scarcity = Object.fromEntries(
    goods.map((g) => [
      g,
      Math.min(3, Math.max(0.4, mean / Math.max(rates[g], 1 / 36))),
    ]),
  ) as Hand;
  const values = Object.fromEntries(
    goods.map((g) => {
      const needed = Math.max(0, (cost[g] ?? 0) - hand[g]);
      const importance =
        needed > 0
          ? 1.4
          : goal !== "balanced" && hand[g] > (cost[g] ?? 0)
            ? 0.85
            : 1;
      return [g, scarcity[g] * importance];
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
  // Spend surplus before cards reserved for the selected goal. Each card
  // removed from that reserve increases the goal deficit and is more costly.
  const offeredValue = (resource: Goods, count: number) => {
    if (goal === "balanced") return count * scarcity[resource];
    const surplus = Math.max(0, hand[resource] - (cost[resource] ?? 0));
    return (
      scarcity[resource] *
      (Math.min(count, surplus) * 0.85 + Math.max(0, count - surplus) * 1.4)
    );
  };
  // Invert the same piecewise valuation when calculating comparable offers.
  const offeredCountForValue = (resource: Goods, value: number) => {
    if (goal === "balanced") return value / scarcity[resource];
    const surplus = Math.max(0, hand[resource] - (cost[resource] ?? 0));
    const surplusValue = surplus * 0.85 * scarcity[resource];
    return value <= surplusValue
      ? value / (0.85 * scarcity[resource])
      : surplus + (value - surplusValue) / (1.4 * scarcity[resource]);
  };
  const givenValue = goods.reduce(
    (sum, g) => sum + offeredValue(g, give[g]),
    0,
  );
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
          const fixedValue =
            givenValue - offeredValue(resource, give[resource]);
          const min = Math.max(
            giveKinds.length === 1 ? 1 : 0,
            Math.ceil(
              offeredCountForValue(resource, receivedValue * 0.8 - fixedValue) -
                1e-10,
            ),
          );
          const max = Math.floor(
            offeredCountForValue(resource, receivedValue * 1.2 - fixedValue) +
              1e-10,
          );
          // Market comparisons may suggest more cards than this hand contains.
          // Keep that theoretical range, but distinguish the amounts the
          // player can actually offer while the other cards stay fixed.
          const affordableMax = Math.min(max, hand[resource]);
          const fixedCardsAffordable = goods.every(
            (g) =>
              Number.isSafeInteger(hand[g]) &&
              hand[g] >= 0 &&
              (g === resource ||
                (Number.isSafeInteger(give[g]) &&
                  give[g] >= 0 &&
                  give[g] <= hand[g])),
          );
          const affordable =
            fixedCardsAffordable && min <= affordableMax
              ? { min, max: affordableMax }
              : null;
          return { resource, min, max, affordable };
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
