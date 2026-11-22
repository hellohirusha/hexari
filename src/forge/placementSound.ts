import type { Game } from "./engine";

/** Determine the actual piece added by an accepted game transition. */
export function placementSound(before: Game, after: Game) {
  for (let seat = 0; seat < 2; seat++) {
    const previous = before.players[seat];
    const current = after.players[seat];
    if (current.cities.some((corner) => !previous.cities.includes(corner)))
      return "city" as const;
    if (
      current.settlements.some(
        (corner) => !previous.settlements.includes(corner),
      )
    )
      return "settlement" as const;
    if (
      current.roads.some(
        ([a, b]) =>
          !previous.roads.some(
            ([x, y]) => (a === x && b === y) || (a === y && b === x),
          ),
      )
    )
      return "road" as const;
  }
  return null;
}
