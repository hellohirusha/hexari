import { useCallback, useEffect, useState } from "react";
import type { Game } from "./engine";
import { soundCue } from "./sound";

type Opening = {
  keys: ReadonlySet<string>;
  phase: "waiting" | "landing";
};

/** Present the existing starting pieces after the board has appeared. */
export function useOpeningPlacements(
  started: boolean,
  boardReady: boolean,
  sound: boolean,
) {
  const [opening, setOpening] = useState<Opening | null>(null);

  const beginOpening = useCallback((game: Game) => {
    const keys = new Set<string>();
    game.players.forEach((player, index) => {
      if (player.settlements.length)
        keys.add(`settlement:${index}:${player.settlements[0]}`);
    });
    setOpening(keys.size ? { keys, phase: "waiting" } : null);
  }, []);

  const cancelOpening = useCallback(() => setOpening(null), []);

  useEffect(() => {
    if (!opening || !started) return;
    if (opening.phase === "waiting") {
      // The SVG board remains available if Pixi cannot initialize.
      const timer = setTimeout(
        () => {
          if (sound) soundCue("settlement");
          setOpening((current) =>
            current === opening ? { ...current, phase: "landing" } : current,
          );
        },
        boardReady ? 700 : 3000,
      );
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      setOpening((current) => (current === opening ? null : current));
    }, 900);
    return () => clearTimeout(timer);
  }, [started, boardReady, sound, opening]);

  return { opening, beginOpening, cancelOpening };
}
