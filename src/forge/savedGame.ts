import { newGame, goods, boardVersion, type Game } from "./engine";
import { defaultBoard, vertices } from "./board";
import { migrateOpeningGame } from "./openingMigration";

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
    let game = value as Game;
    if (
      game.boardVersion !== boardVersion ||
      (game.phase !== "setup" &&
        game.phase !== "roll" &&
        game.phase !== "discard" &&
        game.phase !== "robber" &&
        game.phase !== "build") ||
      (game.turn !== 0 && game.turn !== 1) ||
      game.winner !== null ||
      !Number.isFinite(game.turnStarted) ||
      !Array.isArray(game.players) ||
      game.players.length !== 2 ||
      (game.phase === "roll" || game.phase === "setup"
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
      const buildings = [...player.settlements, ...player.cities];
      const improvements = [...(player.markets ?? []), ...(player.farms ?? [])];
      if (
        (player.markets?.length ?? 0) > 1 ||
        new Set(improvements).size !== improvements.length ||
        improvements.some((id) => !buildings.includes(id))
      )
        return null;
    }
    if (
      game.robberTile !== undefined &&
      (!Number.isInteger(game.robberTile) ||
        game.robberTile < 0 ||
        game.robberTile >= defaultBoard.length)
    )
      return null;
    if (game.phase === "discard" || game.phase === "robber") {
      const remaining = game.discardRemaining;
      if (
        game.dice !== 7 ||
        !Array.isArray(remaining) ||
        remaining.length !== 2 ||
        remaining.some(
          (count, seat) =>
            !Number.isSafeInteger(count) ||
            count < 0 ||
            count >
              goods.reduce(
                (sum, resource) => sum + game.players[seat].hand[resource],
                0,
              ),
        ) ||
        (game.phase === "discard"
          ? remaining.every((count) => count === 0)
          : remaining.some((count) => count !== 0))
      )
        return null;
    }
    if (game.phase === "setup") {
      game = migrateOpeningGame(game);
      const [first, second] = game.players;
      if (
        game.players.some(
          (player) =>
            player.cities.length ||
            player.farms?.length ||
            player.markets?.length,
        ) ||
        (game.turn === 0 &&
          (first.settlements.length > 1 ||
            first.roads.length !== 0 ||
            second.settlements.length !== 0 ||
            second.roads.length !== 0)) ||
        (game.turn === 1 &&
          (first.settlements.length !== 1 ||
            first.roads.length !== 1 ||
            !first.roads[0].includes(first.settlements[0]) ||
            second.settlements.length > 1 ||
            second.roads.length !== 0))
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
      (game.progressed === false ||
        [initial.players.map((p) => p.settlements[0]), [8, 41]].some(
          (corners) =>
            game.players.every(
              (player, index) => player.settlements[0] === corners[index],
            ),
        )) &&
      game.players.every((player, index) => {
        const start = initial.players[index];
        return (
          goods.every((g) => player.hand[g] === start.hand[g]) &&
          player.settlements.length === 1 &&
          player.cities.length === 0 &&
          player.roads.length === 0
        );
      });
    if (
      game.phase === "setup" &&
      game.turn === 0 &&
      game.players[0].settlements.length === 0
    )
      return null;
    return untouched ? null : { ...game, progressed: true };
  } catch {
    return null;
  }
}
