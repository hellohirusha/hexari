import { defaultBoard, vertices } from "./board";
import { buildKinds, buildOptions } from "./buildOptions";
import { costs, points, type Game, type Player } from "./engine";

function describePlayer(player: Player) {
  const buildings = [
    ...player.settlements.map((corner) => ({ corner, kind: "settlement" })),
    ...player.cities.map((corner) => ({ corner, kind: "city" })),
  ];
  const locations = buildings.map(({ corner, kind }) => {
    const tiles = vertices[corner].tiles
      .map((tile) => defaultBoard[tile])
      .map(({ resource, number }) =>
        number === null ? resource : `${resource} ${number}`,
      )
      .join(", ");
    const improvement = player.farms?.includes(corner)
      ? ", farm"
      : player.markets?.includes(corner)
        ? ", market"
        : "";
    return `${kind} at corner ${corner + 1} (${tiles}${improvement})`;
  });
  return `${points(player)} points; ${locations.join("; ") || "no buildings"}; ${player.roads.length} roads`;
}

export function forgeCoachState(game: Game, question: string) {
  const me = game.players[game.turn];
  const other = game.players[1 - game.turn];
  const options = buildKinds.map((kind) => {
    const option = buildOptions(game, kind);
    const cost = Object.entries(costs[kind])
      .map(([resource, count]) => `${count} ${resource}`)
      .join(", ");
    const locations = option.edges.length || option.corners.length;
    return `${kind} costs ${cost}; ${option.affordable ? "affordable" : "not affordable"}; ${locations} legal locations`;
  });
  return {
    board: defaultBoard,
    turn: null,
    vp: points(me),
    hand: me.hand,
    question,
    buildings: `Forge: first to 5 points; settlement 1 point, city 2. A successful build ends the turn. Farms add one wheat on matching rolls; markets improve bank trades to 3:1. One improvement per building, maximum one market. No robber, ports, development cards or longest-road points. Hand cap 7; excess production is lost. Player trades are one card each and require acceptance. Current phase: ${game.phase}; ${game.phase === "roll" ? "roll before building or trading" : "dice have been rolled"}. Current player: ${describePlayer(me)}. Build options: ${options.join("; ")}. Legal locations are counts, not suggestions; do not invent specific locations.`,
    opponents: `Visible opponent: ${describePlayer(other)}. Opponent hand is hidden.`,
    history: [],
  };
}
