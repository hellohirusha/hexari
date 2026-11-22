import { vertices } from "./board";
import {
  canAfford,
  costs,
  legalRoad,
  legalSettlement,
  type Building,
  type Game,
} from "./engine";

export const buildKinds: Building[] = ["road", "settlement", "city"];

export function buildOptions(game: Game, building: Building) {
  const player = game.players[game.turn];
  const affordable = canAfford(player.hand, costs[building]);
  const edges: [number, number][] =
    building === "road"
      ? vertices.flatMap((vertex) =>
          vertex.neighbors
            .filter((id) => id > vertex.id && legalRoad(game, vertex.id, id))
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
      game.phase === "build" &&
      affordable &&
      (corners.length > 0 || edges.length > 0),
  };
}
