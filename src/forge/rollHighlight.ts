import type { Tile } from "../shared/board";

/** A seven has no production tile; otherwise highlight every tile with the roll. */
export function matchingRollTiles(
  board: readonly Tile[],
  total: number,
): number[] {
  return board.flatMap((tile, index) => (tile.number === total ? [index] : []));
}
