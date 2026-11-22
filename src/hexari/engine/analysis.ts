import {
  pips,
  vertices,
  scoreVertex,
  swapTiles,
  ports as defaultPorts,
  type Port,
  type Tile,
} from "../../shared/board";
import { goods, type Goods, type Hand } from "../../shared/resources";
export function production(board: Tile[]): Hand {
  const result: Hand = { wood: 0, brick: 0, wheat: 0, ore: 0, sheep: 0 };
  for (const tile of board)
    if (tile.resource !== "desert" && tile.number)
      result[tile.resource] += (pips[tile.number] ?? 0) / 36;
  return result;
}

/** Comparable opening signals: relevant pips at the best corner, divided by 15.
 * These are board-specific opportunities, not estimates of win probability. */
export function strategyOpportunities(board: Tile[], ports: Port[]) {
  const strategies = [
    { id: "city", label: "Ore and wheat", resources: ["ore", "wheat"] },
    { id: "road", label: "Wood and brick", resources: ["wood", "brick"] },
    {
      id: "port",
      label: "Port trading",
      resources: ["wood", "brick", "wheat", "ore", "sheep"],
    },
  ];
  return strategies.map((strategy) => {
    const eligible =
      strategy.id === "port"
        ? vertices.filter((vertex) =>
            ports.some(
              (port) =>
                port.vertex === vertex.id || port.otherVertex === vertex.id,
            ),
          )
        : vertices;
    const scores = eligible
      .map((vertex) => ({
        corner: vertex.id,
        pips: vertex.tiles.reduce((sum, index) => {
          const tile = board[index];
          const port = ports.find(
            (item) =>
              item.vertex === vertex.id || item.otherVertex === vertex.id,
          );
          const usable =
            strategy.id !== "port" ||
            !port ||
            port.resource === "any" ||
            port.resource === tile?.resource;
          return (
            sum +
            (tile &&
            usable &&
            strategy.resources.includes(tile.resource) &&
            tile.number
              ? (pips[tile.number] ?? 0)
              : 0)
          );
        }, 0),
      }))
      .sort((a, b) => b.pips - a.pips || a.corner - b.corner);
    const best = scores[0];
    return {
      id: strategy.id,
      label: strategy.label,
      corner: best?.corner ?? null,
      pips: best?.pips ?? 0,
      score: (best?.pips ?? 0) / 15,
    };
  });
}

/** Hypothetical teaching examples anchored to the current board. */
export function mistakeExamples(board: Tile[], ports: Port[]) {
  const ranked = vertices.map((vertex) => {
    const tiles = vertex.tiles.map((id) => board[id]).filter(Boolean);
    return {
      vertex,
      tiles,
      pips: tiles.reduce((sum, tile) => sum + (pips[tile.number ?? 0] ?? 0), 0),
      unique: new Set(
        tiles
          .filter((tile) => tile.resource !== "desert")
          .map((tile) => tile.resource),
      ).size,
    };
  });
  const best = [...ranked].sort(
    (a, b) => b.pips - a.pips || a.vertex.id - b.vertex.id,
  )[0];
  const narrow = [...ranked].sort(
    (a, b) => a.unique - b.unique || b.pips - a.pips,
  )[0];
  const noWheat =
    [...ranked]
      .filter((entry) => !entry.tiles.some((tile) => tile.resource === "wheat"))
      .sort((a, b) => b.pips - a.pips)[0] ?? best;
  const edge = ranked.find((entry) => entry.vertex.tiles.length < 3)!;
  const port = ranked.find((entry) =>
    ports.some(
      (item) =>
        item.vertex === entry.vertex.id || item.otherVertex === entry.vertex.id,
    ),
  );
  const neighbor = best.vertex.neighbors[0];
  const label = (id: number) => `Corner ${id + 1}`;
  return [
    {
      corner: narrow.vertex.id,
      example: `${label(narrow.vertex.id)} touches ${narrow.unique} resource type${narrow.unique === 1 ? "" : "s"}. Consider what your other placement must supply.`,
    },
    {
      corner: best.vertex.id,
      example: `${label(best.vertex.id)} has ${best.pips} pips. Check its resources against your plan before choosing it.`,
    },
    {
      corner: noWheat.vertex.id,
      example: noWheat.tiles.some((tile) => tile.resource === "wheat")
        ? `Check whether wheat near ${label(noWheat.vertex.id)} is enough for your plan.`
        : `${label(noWheat.vertex.id)} has no wheat. A second placement or trading plan can cover it.`,
    },
    {
      corner: edge.vertex.id,
      example: `${label(edge.vertex.id)} is on the edge. Check where your roads could reach before committing.`,
    },
    {
      corner: best.vertex.id,
      example: `If you settle at ${label(best.vertex.id)}, compare an offer with your production and next building cost.`,
    },
    {
      corner: best.vertex.id,
      example: `A road from ${label(best.vertex.id)} toward ${label(neighbor)} needs a useful destination, not just available resources.`,
    },
    {
      corner: neighbor,
      example: `If a rival occupies ${label(neighbor)}, the adjacent ${label(best.vertex.id)} cannot receive a settlement.`,
    },
    {
      corner: port?.vertex.id ?? edge.vertex.id,
      example: port
        ? `${label(port.vertex.id)} touches a port. Compare its trade rate with your likely production.`
        : `No ports are marked. Check the coast near ${label(edge.vertex.id)} and add the ports on your board.`,
    },
    {
      corner: best.vertex.id,
      example: `If your hand reaches eight cards while playing near ${label(best.vertex.id)}, plan for a possible seven and discard under standard rules.`,
    },
    {
      corner: best.vertex.id,
      example: `Even if a number beside ${label(best.vertex.id)} has not appeared recently, its next-roll probability is unchanged.`,
    },
  ];
}
export function yieldForRoll(
  board: Tile[],
  settlements: number[],
  roll: number,
  blockedTile?: number | null,
): Hand {
  const result: Hand = { wood: 0, brick: 0, wheat: 0, ore: 0, sheep: 0 };
  for (const id of settlements)
    for (const i of vertices[id]?.tiles ?? []) {
      const tile = board[i];
      if (
        i !== blockedTile &&
        tile.number === roll &&
        tile.resource !== "desert"
      )
        result[tile.resource]++;
    }
  return result;
}
export function tradeValue(
  board: Tile[],
  give: Goods,
  receive: Goods,
  amount: number,
) {
  const rates = production(board),
    avg = goods.reduce((s, g) => s + rates[g], 0) / goods.length;
  const value = (g: Goods) => avg / Math.max(rates[g], 1 / 36);
  const ratio = value(receive) / (value(give) * Math.max(1, amount));
  return {
    ratio,
    rates,
    verdict: ratio >= 1.15 ? "Favorable" : ratio >= 0.8 ? "Close" : "Costly",
  };
}
/** Board-wide scarcity is a heuristic, not a prediction of another player's valuation. */
export function bundleTradeValue(
  board: Tile[],
  give: Hand,
  receive: Hand,
  genericRate: 3 | 4,
  specialPort?: Goods,
) {
  const rates = production(board);
  const average =
    goods.reduce((sum, resource) => sum + rates[resource], 0) / goods.length;
  const value = (resource: Goods) =>
    average / Math.max(rates[resource], 1 / 36);
  const given = goods.reduce(
    (sum, resource) => sum + give[resource] * value(resource),
    0,
  );
  const received = goods.reduce(
    (sum, resource) => sum + receive[resource] * value(resource),
    0,
  );
  const byResource = Object.fromEntries(
    goods.map((resource) => [
      resource,
      Math.floor(give[resource] / (resource === specialPort ? 2 : genericRate)),
    ]),
  ) as Hand;
  const credits = goods.reduce(
    (sum, resource) => sum + byResource[resource],
    0,
  );
  const requested = goods.reduce((sum, resource) => sum + receive[resource], 0);
  const ratio = given > 0 ? received / given : 0;
  return {
    given,
    received,
    ratio,
    credits,
    requested,
    bankCanMatch:
      requested > 0 &&
      credits >= requested &&
      goods.every(
        (resource) => receive[resource] <= credits - byResource[resource],
      ),
    verdict: ratio >= 1.15 ? "Favorable" : ratio >= 0.8 ? "Close" : "Costly",
  };
}
export function shuffledBoard(
  board: Tile[],
  random: () => number = Math.random,
): Tile[] {
  const copy = board.map((t) => ({ ...t }));
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
const regionNames = [
  "Northwest",
  "Northeast",
  "Southwest",
  "Southeast",
] as const;
const regionVertices = regionNames.map((_, region) =>
  vertices.filter((v) => (v.x >= 0 ? 1 : 0) + (v.y >= 0 ? 2 : 0) === region),
);
const regionPairs = regionVertices.map((group) =>
  group.flatMap((a, i) =>
    group
      .slice(i + 1)
      .filter((b) => !a.neighbors.includes(b.id))
      .map((b) => [a.id, b.id] as const),
  ),
);

/** Independent ideal openings within four geometric regions, ignoring turn order and opponents. */
export function regionalOpenings(board: Tile[]) {
  const productionByVertex = vertices.map((v) =>
    v.tiles.reduce(
      (sum, tile) => sum + (pips[board[tile].number ?? 0] ?? 0),
      0,
    ),
  );
  return regionPairs.map((pairs, region) => {
    let best: readonly [number, number] | undefined;
    let pipsTotal = -1;
    for (const pair of pairs) {
      const value = productionByVertex[pair[0]] + productionByVertex[pair[1]];
      if (value > pipsTotal) {
        best = pair;
        pipsTotal = value;
      }
    }
    return { region: regionNames[region], pips: pipsTotal, corners: best };
  });
}

export function balanceBoard(
  board: Tile[],
  iterations = 500,
  random: () => number = Math.random,
): Tile[] {
  const fairness = (b: Tile[]) => {
    const scores = regionalOpenings(b).map((region) => region.pips);
    return Math.max(...scores) - Math.min(...scores);
  };
  let best = board.map((t) => ({ ...t })),
    score = fairness(best);
  for (let i = 0; i < iterations; i++) {
    const candidate = shuffledBoard(board, random),
      next = fairness(candidate);
    if (next < score) {
      best = candidate;
      score = next;
    }
  }
  return best;
}

/** Simulate a four-seat snake draft. Scores are a model, not actual player choices. */
export function simulateSeats(board: Tile[], ports: Port[] = defaultPorts) {
  const rankings = vertices.map((v) =>
    scoreVertex(board, v, "balanced", undefined, ports),
  );
  const picks: number[][] = [[], [], [], []];
  const blocked = new Set<number>();
  for (const seat of [0, 1, 2, 3, 3, 2, 1, 0]) {
    const first = picks[seat][0];
    const firstResources = new Set(
      first === undefined
        ? []
        : vertices[first].tiles
            .map((t) => board[t].resource)
            .filter((r) => r !== "desert"),
    );
    const candidates = vertices
      .filter((v) => !blocked.has(v.id))
      .map((v) => ({
        id: v.id,
        score:
          rankings[v.id].score +
          (first === undefined
            ? 0
            : new Set(
                v.tiles
                  .map((t) => board[t].resource)
                  .filter((r) => r !== "desert" && !firstResources.has(r)),
              ).size),
      }))
      .sort((a, b) => b.score - a.score || a.id - b.id);
    const pick = candidates[0]?.id;
    if (pick === undefined) break;
    picks[seat].push(pick);
    blocked.add(pick);
    vertices[pick].neighbors.forEach((n) => blocked.add(n));
  }
  return picks.map((corners, seat) => {
    const firstResources = new Set(
      corners.length
        ? vertices[corners[0]].tiles
            .map((t) => board[t].resource)
            .filter((r) => r !== "desert")
        : [],
    );
    const complement =
      corners.length < 2
        ? 0
        : new Set(
            vertices[corners[1]].tiles
              .map((t) => board[t].resource)
              .filter((r) => r !== "desert" && !firstResources.has(r)),
          ).size;
    return {
      seat: seat + 1,
      corners,
      score:
        corners.reduce((sum, id) => sum + rankings[id].score, 0) + complement,
    };
  });
}

export function balanceSeatDraft(
  board: Tile[],
  ports: Port[] = defaultPorts,
  options: {
    iterations?: number;
    threshold?: number;
    random?: () => number;
    generateNew?: boolean;
  } = {},
) {
  const {
    iterations = 300,
    threshold = 3,
    random = Math.random,
    generateNew = false,
  } = options;
  const evaluate = (candidate: Tile[]) => {
    const seats = simulateSeats(candidate, ports);
    const scores = seats.map((s) => s.score);
    return { seats, gap: Math.max(...scores) - Math.min(...scores) };
  };
  let best = board.map((t) => ({ ...t }));
  let result = evaluate(best);
  let foundDifferent = false;
  let tried = 0;
  const consider = (candidate: Tile[]) => {
    const different = candidate.some(
      (tile, index) =>
        tile.resource !== board[index].resource ||
        tile.number !== board[index].number,
    );
    if (generateNew && !different) return;
    const next = evaluate(candidate);
    if (next.gap < result.gap || (generateNew && !foundDifferent)) {
      best = candidate;
      result = next;
      foundDifferent = different;
    }
  };
  while (
    tried < iterations &&
    (result.gap > threshold || (generateNew && !foundDifferent))
  ) {
    consider(shuffledBoard(board, random));
    if (result.gap > threshold || (generateNew && !foundDifferent)) {
      const first = tried % board.length;
      const second = (tried * 7 + 1) % board.length;
      consider(swapTiles(best, first, second));
    }
    tried++;
  }
  return {
    board: best,
    ...result,
    reached: result.gap <= threshold && (!generateNew || foundDifferent),
    threshold,
    tried,
  };
}
