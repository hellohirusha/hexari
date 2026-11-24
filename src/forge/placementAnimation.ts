import type { Game } from "./engine";

/** Edge orientation does not affect the identity of a road. */
export function roadPlacementKey(player: number, a: number, b: number): string {
  return `road:${player}:${Math.min(a, b)}:${Math.max(a, b)}`;
}

function placements(game: Game): Set<string> {
  const keys = new Set<string>();
  game.players.forEach((player, index) => {
    player.roads.forEach(([a, b]) => keys.add(roadPlacementKey(index, a, b)));
    player.settlements.forEach((corner) =>
      keys.add(`settlement:${index}:${corner}`),
    );
    player.cities.forEach((corner) => keys.add(`city:${index}:${corner}`));
  });
  return keys;
}

/** Animate additions, including upgrades, but never existing pieces. */
export function newPlacementKeys(previous: Game, current: Game): Set<string> {
  const before = placements(previous);
  return new Set([...placements(current)].filter((key) => !before.has(key)));
}
