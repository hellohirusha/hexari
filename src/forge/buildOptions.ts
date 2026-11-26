import { vertices } from "./board";
import {
  canAfford,
  costs,
  legalRoad,
  legalSettlement,
  legalSetupRoad,
  remainingPieces,
  type Building,
  type Game,
} from "./engine";

export const buildKinds: Building[] = ["road", "settlement", "city"];

export function buildOptions(game: Game, building: Building) {
  const player = game.players[game.turn];
  const setupRoad = game.phase === "setup" && building === "road";
  const affordable = setupRoad || canAfford(player.hand, costs[building]);
  const edges: [number, number][] =
    building === "road"
      ? vertices.flatMap((vertex) =>
          vertex.neighbors
            .filter(
              (id) =>
                id > vertex.id &&
                (setupRoad
                  ? legalSetupRoad(game, vertex.id, id)
                  : legalRoad(game, vertex.id, id)),
            )
            .map((id) => [vertex.id, id] as [number, number]),
        )
      : [];
  const corners =
    building === "settlement"
      ? vertices.filter((v) => legalSettlement(game, v.id)).map((v) => v.id)
      : building === "city"
        ? [...player.settlements]
        : [];
  return {
    affordable,
    corners,
    edges,
    available:
      (game.phase === "build" || setupRoad) &&
      affordable &&
      remainingPieces(player, building) > 0 &&
      (corners.length > 0 || edges.length > 0),
  };
}
