import { defaultBoard, vertices } from "./board";
import { buildKinds, buildOptions } from "./buildOptions";
import {
  costs,
  longestRoadLength,
  longestRoadOwner,
  totalPoints,
  type Game,
  type Player,
} from "./engine";

function describePlayer(player: Player, opponent: Player, score: number) {
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
    return `${kind} at corner ${corner + 1} (${tiles})`;
  });
  return `${score} points; ${locations.join("; ") || "no buildings"}; ${player.roads.length} roads, longest continuous road ${longestRoadLength(player, opponent)}`;
}

export type ForgeCoachMemory = { question: string; advice: string };

export function forgeCoachState(
  game: Game,
  question: string,
  history: ForgeCoachMemory[] = [],
) {
  const me = game.players[game.turn];
  const other = game.players[1 - game.turn];
  const handSize = Object.values(me.hand).reduce(
    (total, count) => total + count,
    0,
  );
  const options = buildKinds.map((kind) => {
    const option = buildOptions(game, kind);
    const cost = Object.entries(costs[kind])
      .map(([resource, count]) => `${count} ${resource}`)
      .join(", ");
    const locations = option.edges.length || option.corners.length;
    return `${kind} costs ${cost}; ${option.affordable ? "affordable" : "not affordable"}; ${locations} legal locations`;
  });
  const phaseInstruction =
    game.phase === "setup"
      ? "choose a free starting settlement"
      : game.phase === "roll"
        ? "roll before building or trading"
        : game.phase === "build"
          ? "dice have been rolled"
          : "game is over";
  return {
    board: defaultBoard,
    turn: null,
    vp: totalPoints(game, game.turn),
    hand: me.hand,
    question,
    buildings: `Forge: first to 5 points; settlement 1 point, city 2. Longest continuous road of at least 5 segments awards 2 points; tied incumbent retains it. Current holder: ${longestRoadOwner(game) === null ? "none" : `player ${longestRoadOwner(game)! + 1}`}. A successful build ends the turn. Build roads and settlements, or upgrade your own settlement to a city. Bank trades exchange four matching cards for one different resource. No robber, ports or development cards. On a 7 each player with room receives one of their least-held resources. Hand cap 7; current hand ${handSize} cards, ${Math.max(0, 7 - handSize)} spaces free; excess production is lost. Player trades are one card each and require acceptance. Current phase: ${game.phase}; ${phaseInstruction}. Current player: ${describePlayer(me, other, totalPoints(game, game.turn))}. Build options: ${options.join("; ")}. Legal locations are counts, not suggestions; do not invent specific locations.`,
    opponents: `Visible opponent: ${describePlayer(other, me, totalPoints(game, game.turn === 0 ? 1 : 0))}. Opponent hand is hidden.`,
    history: history.slice(-3).map((entry) => ({
      question: entry.question.slice(0, 80),
      advice: entry.advice.slice(0, 600),
    })),
  };
}
