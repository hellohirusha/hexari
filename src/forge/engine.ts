import { defaultBoard, vertices } from "./board.ts";
import { pips } from "../shared/board.ts";
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
  // Kept only so older saves can be loaded; these no longer affect play.
  markets?: number[];
  farms?: number[];
};
export type Game = {
  phase: "setup" | "roll" | "build" | "end";
  turn: 0 | 1;
  players: [Player, Player];
  dice: number | null;
  winner: number | null;
  turnStarted: number;
  progressed?: boolean;
  /** Previous award holder, persisted to resolve equal-length ties. */
  longestRoad?: 0 | 1 | null;
};
const starter = (corner: number): Player => ({
  hand: { wood: 1, brick: 1, wheat: 1, ore: 1, sheep: 1 },
  settlements: [corner],
  cities: [],
  roads: [],
});
export function newGame(
  now = Date.now(),
  options?: { manualSetup?: boolean },
): Game {
  const players: [Player, Player] = [starter(23), starter(38)];
  if (options?.manualSetup)
    for (const player of players) player.settlements = [];
  return {
    phase: options?.manualSetup ? "setup" : "roll",
    turn: 0,
    players,
    dice: null,
    winner: null,
    turnStarted: now,
    longestRoad: null,
  };
}
export type Building = "road" | "settlement" | "city";
export const costs: Record<Building, Partial<Hand>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
  city: { wheat: 2, ore: 3 },
};
export function bankRate() {
  return 4;
}
export function points(p: Player) {
  return p.settlements.length + p.cities.length * 2;
}
/** Length of the longest continuous trail; each road can be used only once. */
export function longestRoadLength(player: Player, opponent: Player): number {
  const adjacent = new Map<number, { edge: number; to: number }[]>();
  player.roads.forEach(([a, b], edge) => {
    adjacent.set(a, [...(adjacent.get(a) ?? []), { edge, to: b }]);
    adjacent.set(b, [...(adjacent.get(b) ?? []), { edge, to: a }]);
  });
  const blocked = new Set([...opponent.settlements, ...opponent.cities]);
  const used = new Set<number>();
  function walk(vertex: number, length: number): number {
    if (length && blocked.has(vertex)) return length;
    let best = length;
    for (const { edge, to } of adjacent.get(vertex) ?? []) {
      if (used.has(edge)) continue;
      used.add(edge);
      best = Math.max(best, walk(to, length + 1));
      used.delete(edge);
    }
    return best;
  }
  let best = 0;
  for (const vertex of adjacent.keys()) best = Math.max(best, walk(vertex, 0));
  return best;
}
/** A tied holder retains the award; without a previous holder a tie awards nobody. */
export function longestRoadOwner(game: Game): 0 | 1 | null {
  const lengths = [
    longestRoadLength(game.players[0], game.players[1]),
    longestRoadLength(game.players[1], game.players[0]),
  ];
  const highest = Math.max(...lengths);
  if (highest < 5) return null;
  if (lengths[0] === lengths[1]) return game.longestRoad ?? null;
  return lengths[0] > lengths[1] ? 0 : 1;
}
export function totalPoints(game: Game, seat: 0 | 1): number {
  return points(game.players[seat]) + (longestRoadOwner(game) === seat ? 2 : 0);
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
/** Starting settlements need no road but must obey the distance rule. */
export function legalSetupSettlement(game: Game, id: number): boolean {
  const vertex = vertices[id];
  if (
    game.phase !== "setup" ||
    !vertex ||
    game.players[game.turn].settlements.length
  )
    return false;
  const occupied = game.players.flatMap((player) => [
    ...player.settlements,
    ...player.cities,
  ]);
  return (
    !occupied.includes(id) &&
    !vertex.neighbors.some((neighbor) => occupied.includes(neighbor)) &&
    vertex.tiles.some((tile) => defaultBoard[tile].resource !== "desert")
  );
}
/** A deterministic placement for the bot and turn timeout. */
export function bestSetupSettlement(game: Game): number | undefined {
  return vertices
    .filter((vertex) => legalSetupSettlement(game, vertex.id))
    .sort((a, b) => {
      const score = (id: number) =>
        vertices[id].tiles.reduce(
          (sum, tile) => sum + (pips[defaultBoard[tile].number ?? 0] ?? 0),
          0,
        );
      return score(b.id) - score(a.id) || a.id - b.id;
    })[0]?.id;
}
export function legalRoad(game: Game, a: number, b: number): boolean {
  if (
    game.players[game.turn].roads.length >= 15 ||
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
  if (next.phase === "setup") {
    if (
      action.type !== "build" ||
      action.building !== "settlement" ||
      action.to !== undefined ||
      !legalSetupSettlement(next, action.at)
    )
      return game;
    next.players[next.turn].settlements.push(action.at);
    next.progressed = true;
    next.turnStarted = action.now ?? Date.now();
    if (next.turn === 0) next.turn = 1;
    else {
      next.turn = 0;
      next.phase = "roll";
    }
    return next;
  }
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
    // Seven has no robber in Forge. A small supply grant helps hands recover
    // from resource starvation while respecting the same seven-card cap.
    if (action.total === 7) {
      next.players.forEach((player, seat) => {
        if (
          goods.reduce((sum, resource) => sum + player.hand[resource], 0) >= 7
        )
          return;
        const offset = (next.turn + seat) % goods.length;
        const preference = goods.map(
          (_, index) => goods[(offset + index) % goods.length],
        );
        const resource = preference.reduce((best, item) =>
          player.hand[item] < player.hand[best] ? item : best,
        );
        player.hand[resource]++;
      });
    }
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
    return next;
  }
  if (action.type === "endTurn") {
    next.progressed = true;
    next.turn = next.turn === 0 ? 1 : 0;
    if (totalPoints(next, next.turn) >= 5) {
      next.phase = "end";
      next.winner = next.turn;
      return next;
    }
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
    const rate = bankRate();
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
  } else return game;
  for (const g of goods) player.hand[g] -= costs[action.building][g] ?? 0;
  next.longestRoad = longestRoadOwner(next);
  if (totalPoints(next, next.turn) >= 5) {
    next.phase = "end";
    next.winner = next.turn;
    return next;
  }
  return transition(next, { type: "endTurn", now: action.now ?? Date.now() });
}
