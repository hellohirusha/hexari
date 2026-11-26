import type { Game } from "./engine.ts";

/** Resume an older opening at the road placement that now follows its settlement. */
export function migrateOpeningGame(game: Game): Game {
  const first = game.players?.[0];
  const second = game.players?.[1];
  if (
    game.phase === "setup" &&
    game.turn === 1 &&
    first?.settlements?.length === 1 &&
    first.roads?.length === 0 &&
    second?.settlements?.length === 0 &&
    second.roads?.length === 0
  )
    return { ...game, turn: 0 };
  return game;
}
