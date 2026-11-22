import {
  scoreVertex,
  vertices,
  type Port,
  type Strategy,
  type Tile,
} from "../../shared/board";

/** Ranks legal corners for the active placement. Scores are heuristics, not win probabilities. */
export function rankSettlements(
  board: Tile[],
  strategy: Strategy,
  ports: Port[],
  first?: number,
) {
  const firstVertex = first === undefined ? undefined : vertices[first];
  if (first !== undefined && !firstVertex)
    throw new RangeError("Invalid first settlement");
  const ranked = vertices
    .map((vertex) => ({
      ...vertex,
      ...scoreVertex(board, vertex, strategy, firstVertex, ports),
      eligible:
        !firstVertex ||
        (vertex.id !== firstVertex.id &&
          !firstVertex.neighbors.includes(vertex.id)),
    }))
    .sort((a, b) => b.score - a.score || a.id - b.id);
  const legal = ranked.filter((entry) => entry.eligible);
  const bestScore = Math.max(0, ...legal.map((entry) => entry.score));
  return ranked.map((entry) => {
    if (!entry.eligible)
      return {
        ...entry,
        rank: null,
        percentile: null,
        scoreOutOf100: null,
        eligibleCount: legal.length,
      };
    const rank = 1 + legal.filter((other) => other.score > entry.score).length;
    const percentile =
      legal.length < 2
        ? 100
        : (100 * legal.filter((other) => other.score < entry.score).length) /
          (legal.length - 1);
    const scoreOutOf100 =
      bestScore > 0 ? Math.min(100, (100 * entry.score) / bestScore) : 0;
    return {
      ...entry,
      rank,
      percentile,
      scoreOutOf100,
      eligibleCount: legal.length,
    };
  });
}
