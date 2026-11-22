import { bestSetupSettlement, transition, type Game } from "./engine";

/** An untouched game waits for a player action instead of starting a bot turn. */
export function applyTurnTimeout(game: Game, now: number): Game {
  if (game.phase === "end") return game;
  if (game.phase === "setup") {
    const at = bestSetupSettlement(game);
    return at === undefined
      ? game
      : transition(game, { type: "build", building: "settlement", at, now });
  }
  if (game.progressed !== true && game.phase === "roll" && game.turn === 0) {
    return { ...game, turnStarted: now };
  }
  return transition(game, { type: "endTurn", now });
}
