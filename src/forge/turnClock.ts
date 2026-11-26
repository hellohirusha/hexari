import type { Game } from "./engine";

/** Remaining turn time in whole seconds, frozen at pause or game end. */
export function turnTimeRemaining(
  game: Pick<Game, "phase" | "turnStarted" | "gameEndedAt">,
  now: number,
  pausedAt: number | null = null,
): number {
  const reference =
    game.phase === "end" && game.gameEndedAt !== undefined
      ? game.gameEndedAt
      : (pausedAt ?? now);
  return Math.min(
    120,
    Math.max(0, 120 - Math.floor((reference - game.turnStarted) / 1000)),
  );
}
