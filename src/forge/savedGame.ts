import { newGame, goods, type Game } from "./engine";
import { vertices } from "./board";

const validCorner = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value < vertices.length;

export function parseResumableGame(raw: string | null): Game | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const game = value as Game;
    if (
      (game.phase !== "roll" && game.phase !== "build") ||
      (game.turn !== 0 && game.turn !== 1) ||
      game.winner !== null ||
      !Number.isFinite(game.turnStarted) ||
      !Array.isArray(game.players) ||
      game.players.length !== 2 ||
      (game.phase === "roll"
        ? game.dice !== null
        : !Number.isInteger(game.dice) || game.dice! < 2 || game.dice! > 12)
    )
      return null;
    for (const player of game.players) {
      if (
        !player ||
        !player.hand ||
        !goods.every(
          (g) => Number.isInteger(player.hand[g]) && player.hand[g] >= 0,
        ) ||
        !Array.isArray(player.settlements) ||
        !player.settlements.every(validCorner) ||
        !Array.isArray(player.cities) ||
        !player.cities.every(validCorner) ||
        (player.markets !== undefined &&
          (!Array.isArray(player.markets) ||
            !player.markets.every(validCorner))) ||
        (player.farms !== undefined &&
          (!Array.isArray(player.farms) || !player.farms.every(validCorner))) ||
        !Array.isArray(player.roads) ||
        !player.roads.every(
          (road) =>
            Array.isArray(road) && road.length === 2 && road.every(validCorner),
        )
      )
        return null;
      if (goods.reduce((sum, resource) => sum + player.hand[resource], 0) > 7)
        return null;
      const buildings = [...player.settlements, ...player.cities];
      const improvements = [...(player.markets ?? []), ...(player.farms ?? [])];
      if (
        (player.markets?.length ?? 0) > 1 ||
        new Set(improvements).size !== improvements.length ||
        improvements.some((id) => !buildings.includes(id))
      )
        return null;
    }
    const occupied = game.players.flatMap((player) => [
      ...player.settlements,
      ...player.cities,
    ]);
    if (
      new Set(occupied).size !== occupied.length ||
      occupied.some((corner) =>
        vertices[corner].neighbors.some((neighbor) =>
          occupied.includes(neighbor),
        ),
      )
    )
      return null;
    const roads = new Set<string>();
    for (const player of game.players) {
      for (const [a, b] of player.roads) {
        if (!vertices[a].neighbors.includes(b)) return null;
        const edge = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (roads.has(edge)) return null;
        roads.add(edge);
      }
    }
    const initial = newGame(game.turnStarted);
    const untouched =
      game.progressed !== true &&
      game.phase === "roll" &&
      game.turn === 0 &&
      game.dice === null &&
      [initial.players.map((p) => p.settlements[0]), [8, 41]].some((corners) =>
        game.players.every(
          (player, index) => player.settlements[0] === corners[index],
        ),
      ) &&
      game.players.every((player, index) => {
        const start = initial.players[index];
        return (
          goods.every((g) => player.hand[g] === start.hand[g]) &&
          player.settlements.length === 1 &&
          player.cities.length === 0 &&
          player.roads.length === 0
        );
      });
    return untouched ? null : { ...game, progressed: true };
  } catch {
    return null;
  }
}
