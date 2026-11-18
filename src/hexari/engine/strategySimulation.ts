import {
  scoreVertex,
  vertices,
  type Port,
  type Strategy,
  type Tile,
} from "../../shared/board";
import { emptyHand, goods, type Hand } from "../../shared/resources";
import { shuffledBoard } from "./analysis";

type ModelStrategy = "ore" | "road" | "port" | "balanced";
const strategies: ModelStrategy[] = ["ore", "road", "port", "balanced"];
const cityCost: Hand = { wood: 0, brick: 0, wheat: 2, ore: 3, sheep: 0 };
// One road plus one settlement, with no connectivity model.
const settlementCost: Hand = { wood: 2, brick: 2, wheat: 1, ore: 0, sheep: 1 };
type ModelPlayer = {
  strategy: ModelStrategy;
  settlements: number[];
  cities: number[];
  hand: Hand;
};

/** Fixed seed makes the displayed model reproducible for the same board and ports. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function legal(id: number, blocked: Set<number>) {
  return !blocked.has(id);
}
function block(id: number, blocked: Set<number>) {
  blocked.add(id);
  vertices[id].neighbors.forEach((neighbor) => blocked.add(neighbor));
}
function portsFor(player: ModelPlayer, ports: Port[]) {
  const corners = [...player.settlements, ...player.cities];
  return ports.filter(
    (p) =>
      corners.includes(p.vertex) ||
      (p.otherVertex !== undefined && corners.includes(p.otherVertex)),
  );
}
function afford(hand: Hand, cost: Hand) {
  return goods.every((g) => hand[g] >= cost[g]);
}
function pay(hand: Hand, cost: Hand) {
  goods.forEach((g) => {
    hand[g] -= cost[g];
  });
}

/** Exchange surplus for a single plan, preserving cards needed by that plan. */
function exchange(hand: Hand, cost: Hand, ports: Port[]) {
  for (let step = 0; step < 10 && !afford(hand, cost); step++) {
    const needed = goods.find((g) => hand[g] < cost[g]);
    if (!needed) break;
    const offer = goods
      .map((g) => {
        const rate = ports.reduce(
          (best, p) =>
            p.resource === "any" || p.resource === g
              ? Math.min(best, p.rate)
              : best,
          4,
        );
        return { g, rate, surplus: hand[g] - cost[g] };
      })
      .filter((item) => item.g !== needed && item.surplus >= item.rate)
      .sort((a, b) => b.surplus / b.rate - a.surplus / a.rate)[0];
    if (!offer) break;
    hand[offer.g] -= offer.rate;
    hand[needed]++;
  }
}

/** One simplified race: drafts, dice, bank trades, cities and abstract expansion.
 * No robber, player trades, development cards, road connectivity or resource bank limits. */
export function simulateStrategyRace(
  board: Tile[],
  ports: Port[],
  rotation: number,
  random: () => number,
  maxTurns = 400,
) {
  const players: ModelPlayer[] = strategies.map((_, seat) => ({
    strategy: strategies[(seat + rotation) % strategies.length],
    settlements: [],
    cities: [],
    hand: emptyHand(),
  }));
  const ranked = Object.fromEntries(
    strategies.map((strategy) => [
      strategy,
      vertices
        .map((v) => ({
          id: v.id,
          score: scoreVertex(board, v, strategy as Strategy, undefined, ports)
            .score,
        }))
        .sort((a, b) => b.score - a.score || a.id - b.id)
        .map((entry) => entry.id),
    ]),
  ) as Record<ModelStrategy, number[]>;
  const blocked = new Set<number>();
  for (const seat of [0, 1, 2, 3, 3, 2, 1, 0]) {
    const player = players[seat];
    const id = ranked[player.strategy].find((corner) => legal(corner, blocked));
    if (id === undefined) return null;
    player.settlements.push(id);
    block(id, blocked);
  }
  for (let turn = 0; turn < maxTurns; turn++) {
    const roll = 2 + Math.floor(random() * 6) + Math.floor(random() * 6);
    for (const player of players) {
      for (const [corner, multiplier] of [
        ...player.settlements.map((id) => [id, 1] as const),
        ...player.cities.map((id) => [id, 2] as const),
      ]) {
        for (const tileId of vertices[corner].tiles) {
          const tile = board[tileId];
          if (tile.number === roll && tile.resource !== "desert")
            player.hand[tile.resource] += multiplier;
        }
      }
    }
    const player = players[turn % 4];
    for (let actions = 0; actions < 5; actions++) {
      const candidate = ranked[player.strategy].find((id) =>
        legal(id, blocked),
      );
      const canSettle =
        candidate !== undefined && player.settlements.length < 5;
      const canCity = player.settlements.length > 0 && player.cities.length < 4;
      const plans =
        player.strategy === "road"
          ? (["settlement", "city"] as const)
          : (["city", "settlement"] as const);
      const valid = plans.filter((plan) =>
        plan === "city" ? canCity : canSettle,
      );
      if (!valid.length) break;
      let plan = valid.find((item) =>
        afford(player.hand, item === "city" ? cityCost : settlementCost),
      );
      if (!plan) {
        // Trade only for the preferred target; failed trades are not rolled back.
        const target = valid[0];
        exchange(
          player.hand,
          target === "city" ? cityCost : settlementCost,
          portsFor(player, ports),
        );
        plan = valid.find((item) =>
          afford(player.hand, item === "city" ? cityCost : settlementCost),
        );
      }
      if (!plan) break;
      if (plan === "city") {
        pay(player.hand, cityCost);
        player.cities.push(player.settlements.shift()!);
      } else {
        pay(player.hand, settlementCost);
        player.settlements.push(candidate!);
        block(candidate!, blocked);
      }
      if (player.settlements.length + 2 * player.cities.length >= 5)
        return player.strategy;
    }
  }
  return null;
}

/** Shuffles whole terrain-number pairs from the current board; ports stay fixed. */
export function simulateStrategyDistribution(
  board: Tile[],
  ports: Port[],
  options: { boards?: number; seed?: number; maxTurns?: number } = {},
) {
  const { boards = 24, seed = 1029, maxTurns = 400 } = options;
  const random = seeded(seed);
  const wins: Record<ModelStrategy, number> = {
    ore: 0,
    road: 0,
    port: 0,
    balanced: 0,
  };
  let unfinished = 0;
  for (let index = 0; index < boards; index++) {
    const sample = shuffledBoard(board, random);
    for (let rotation = 0; rotation < 4; rotation++) {
      const winner = simulateStrategyRace(
        sample,
        ports,
        rotation,
        random,
        maxTurns,
      );
      if (winner) wins[winner]++;
      else unfinished++;
    }
  }
  return { wins, unfinished, games: boards * 4, boards, seed, maxTurns };
}
