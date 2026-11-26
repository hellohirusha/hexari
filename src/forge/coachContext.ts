import { defaultBoard, vertices } from "./board";
import { buildKinds, buildOptions } from "./buildOptions";
import {
  costs,
  longestRoadLength,
  longestRoadOwner,
  setupNeedsRoad,
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
      ? setupNeedsRoad(game)
        ? "place a starting road connected to your settlement"
        : "choose a starting settlement"
      : game.phase === "roll"
        ? "roll before building or trading"
        : game.phase === "discard"
          ? "players with eight or more cards must discard half, rounded down"
          : game.phase === "robber"
            ? "move the robber to another tile"
            : game.phase === "build"
              ? "dice have been rolled"
              : "game is over";
  return {
    board: defaultBoard,
    turn: null,
    vp: totalPoints(game, game.turn),
    hand: me.hand,
    question,
    buildings: `Forge: first to 5 points; settlement 1 point, city 2. Longest continuous road of at least 5 segments awards 2 points; tied incumbent retains it. Current holder: ${longestRoadOwner(game) === null ? "none" : `player ${longestRoadOwner(game)! + 1}`}. Each player starts with no resources and places one settlement and a connected road without spending resources. A successful build after setup ends the turn. Bank trades exchange four matching cards for one different resource. On a 7 nobody receives resources; players holding eight or more cards discard half, rounded down, then the roller moves the robber to another tile and steals one random card from an adjacent opponent with cards. The robber blocks production on its tile. No ports or development cards. Current hand: ${handSize} cards. Player trades are one card each and require acceptance. Current phase: ${game.phase}; ${phaseInstruction}. Current player: ${describePlayer(me, other, totalPoints(game, game.turn))}. Build options: ${options.join("; ")}. Legal locations are counts, not suggestions; do not invent specific locations.`,
    opponents: `Visible opponent: ${describePlayer(other, me, totalPoints(game, game.turn === 0 ? 1 : 0))}. Opponent hand is hidden.`,
    history: history.slice(-3).map((entry) => ({
      question: entry.question.slice(0, 80),
      advice: entry.advice.slice(0, 600),
    })),
  };
}
