import { defaultBoard, vertices } from "./board.ts";
import { goods, type Goods, type Hand } from "../shared/resources.ts";
export {
  emptyHand,
  goods,
  type Goods,
  type Hand,
} from "../shared/resources.ts";

export type Player = {
  hand: Hand;
  settlements: number[];
  cities: number[];
  roads: [number, number][];
  markets?: number[];
  farms?: number[];
};
export type Game = {
  phase: "roll" | "build" | "end";
  turn: 0 | 1;
  players: [Player, Player];
  dice: number | null;
  winner: number | null;
  turnStarted: number;
  progressed?: boolean;
};
const starter = (corner: number): Player => ({
  hand: { wood: 1, brick: 1, wheat: 1, ore: 1, sheep: 1 },
  settlements: [corner],
  cities: [],
  roads: [],
});
export function newGame(now = Date.now()): Game {
  return {
    phase: "roll",
    turn: 0,
    players: [starter(23), starter(38)],
    dice: null,
    winner: null,
    turnStarted: now,
  };
}
export type Building = "road" | "settlement" | "city" | "market" | "farm";
export const costs: Record<Building, Partial<Hand>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
  city: { wheat: 2, ore: 3 },
  market: { wood: 2, brick: 1, sheep: 1 },
  farm: { wood: 1, brick: 1, wheat: 1 },
};
export function bankRate(player: Player) {
  return (player.markets?.length ?? 0) > 0 ? 3 : 4;
}
export function legalImprovement(
  game: Game,
  building: "market" | "farm",
  id: number,
) {
  const player = game.players[game.turn];
  return (
    (player.settlements.includes(id) || player.cities.includes(id)) &&
    !(player.markets ?? []).includes(id) &&
    !(player.farms ?? []).includes(id) &&
    (building !== "market" || !player.markets?.length) &&
    (building !== "farm" ||
      vertices[id].tiles.some(
        (tile) => defaultBoard[tile].resource === "wheat",
      ))
  );
}
export function points(p: Player) {
  return p.settlements.length + p.cities.length * 2;
}
export function canAfford(hand: Hand, cost: Partial<Hand>) {
  return goods.every((g) => hand[g] >= (cost[g] ?? 0));
}
export function legalSettlement(game: Game, id: number): boolean {
  const v = vertices[id];
  if (!v) return false;
  const occupied = game.players.flatMap((p) => [...p.settlements, ...p.cities]);
  return (
    !occupied.includes(id) &&
    !v.neighbors.some((n) => occupied.includes(n)) &&
    game.players[game.turn].roads.some(([a, b]) => a === id || b === id)
  );
}
export function legalRoad(game: Game, a: number, b: number): boolean {
  if (
    !vertices[a]?.neighbors.includes(b) ||
    game.players.some((p) =>
      p.roads.some(([x, y]) => (x === a && y === b) || (x === b && y === a)),
    )
  )
    return false;
  const player = game.players[game.turn],
    opponent = game.players[1 - game.turn];
  const connected = (v: number) =>
    ![...opponent.settlements, ...opponent.cities].includes(v) &&
    ([...player.settlements, ...player.cities].includes(v) ||
      player.roads.some(([x, y]) => x === v || y === v));
  return connected(a) || connected(b);
}
export type Action =
  | { type: "roll"; total: number }
  | { type: "endTurn"; now: number }
  | { type: "discard"; resource: Goods }
  | {
      type: "build";
      building: Building;
      at: number;
      to?: number;
      now?: number;
    }
  | { type: "bank"; give: Goods; receive: Goods }
  | { type: "playerTrade"; give: Goods; receive: Goods };
export function transition(game: Game, action: Action): Game {
  const next: Game = structuredClone(game);
  if (next.phase === "end") return game;
  if (action.type === "roll") {
    if (
      next.phase !== "roll" ||
      !Number.isInteger(action.total) ||
      action.total < 2 ||
      action.total > 12
    )
      return game;
    next.dice = action.total;
    next.phase = "build";
    next.progressed = true;
    for (const player of next.players)
      for (const [corners, multiplier] of [
        [player.settlements, 1],
        [player.cities, 2],
      ] as [number[], number][])
        for (const id of corners)
          for (const tile of vertices[id].tiles) {
            const t = defaultBoard[tile];
            if (t.number !== action.total || t.resource === "desert") continue;
            const remaining = Math.max(
              0,
              7 - goods.reduce((n, g) => n + player.hand[g], 0),
            );
            player.hand[t.resource] += Math.min(multiplier, remaining);
          }
    for (const player of next.players)
      for (const id of player.farms ?? [])
        if (
          vertices[id].tiles.some(
            (tile) =>
              defaultBoard[tile].resource === "wheat" &&
              defaultBoard[tile].number === action.total,
          ) &&
          goods.reduce((n, g) => n + player.hand[g], 0) < 7
        )
          player.hand.wheat++;
    return next;
  }
  if (action.type === "endTurn") {
    next.progressed = true;
    next.turn = next.turn === 0 ? 1 : 0;
    next.phase = "roll";
    next.dice = null;
    next.turnStarted = action.now;
    return next;
  }
  if (next.phase !== "build") return game;
  const player = next.players[next.turn];
  if (action.type === "discard") {
    if (player.hand[action.resource] < 1) return game;
    player.hand[action.resource]--;
    return next;
  }
  if (action.type === "bank") {
    const rate = bankRate(player);
    if (action.give === action.receive || player.hand[action.give] < rate)
      return game;
    player.hand[action.give] -= rate;
    player.hand[action.receive]++;
    return next;
  }
  if (action.type === "playerTrade") {
    const other = next.players[1 - next.turn];
    if (
      !goods.includes(action.give) ||
      !goods.includes(action.receive) ||
      action.give === action.receive ||
      player.hand[action.give] < 1 ||
      other.hand[action.receive] < 1
    )
      return game;
    player.hand[action.give]--;
    other.hand[action.give]++;
    other.hand[action.receive]--;
    player.hand[action.receive]++;
    return next;
  }
  if (
    !costs[action.building] ||
    !canAfford(player.hand, costs[action.building])
  )
    return game;
  if (action.building === "road") {
    if (action.to === undefined || !legalRoad(next, action.at, action.to))
      return game;
    player.roads.push([action.at, action.to]);
  } else if (action.building === "settlement") {
    if (!legalSettlement(next, action.at)) return game;
    player.settlements.push(action.at);
  } else if (action.building === "city") {
    if (!player.settlements.includes(action.at)) return game;
    player.settlements = player.settlements.filter((v) => v !== action.at);
    player.cities.push(action.at);
  } else {
    if (!legalImprovement(next, action.building, action.at)) return game;
    if (action.building === "farm") (player.farms ??= []).push(action.at);
    else (player.markets ??= []).push(action.at);
  }
  for (const g of goods) player.hand[g] -= costs[action.building][g] ?? 0;
  if (points(player) >= 5) {
    next.phase = "end";
    next.winner = next.turn;
    return next;
  }
  return transition(next, { type: "endTurn", now: action.now ?? Date.now() });
}
