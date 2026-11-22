import { useEffect, useRef } from "react";
import BrandMark from "../shared/BrandMark";
import { totalPoints, type Game } from "./engine";

export function resultTitle(
  winner: number,
  bot: boolean,
  names?: [string, string],
) {
  return bot
    ? winner === 0
      ? "Victory"
      : "Defeat"
    : `${names?.[winner] ?? `Player ${winner + 1}`} wins`;
}

export default function ForgeResult({
  game,
  bot,
  names,
  onViewBoard,
  onPlayAgain,
}: {
  game: Game;
  bot: boolean;
  names?: [string, string];
  onViewBoard: () => void;
  onPlayAgain: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const winner = game.winner ?? 0;
  const defeat = bot && winner === 1;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`forge-result${defeat ? " forge-result-defeat" : ""}`}
      aria-labelledby="forge-result-title"
      onCancel={(event) => {
        event.preventDefault();
        onViewBoard();
      }}
    >
      <div className="forge-result-mark">
        <BrandMark variant="forge" />
      </div>
      <span className="forge-result-kicker">FORGE · GAME COMPLETE</span>
      <h2 id="forge-result-title">{resultTitle(winner, bot, names)}</h2>
      <p>
        {bot
          ? defeat
            ? "The bot reached 5 points first."
            : "You reached 5 points first."
          : `${names?.[winner] ?? `Player ${winner + 1}`} reached 5 points first.`}
      </p>
      <div className="forge-result-scores" aria-label="Final scores">
        {game.players.map((_, index) => (
          <div key={index} className={index === winner ? "winner" : undefined}>
            <span>
              {names?.[index] ??
                (bot ? (index === 0 ? "You" : "Bot") : `Player ${index + 1}`)}
              {names && bot ? (index === 0 ? " · You" : " · Bot") : ""}
            </span>
            <strong>
              {totalPoints(game, index as 0 | 1)} <small>VP</small>
            </strong>
          </div>
        ))}
      </div>
      <div className="forge-result-actions">
        <button
          type="button"
          className="button primary"
          onClick={onPlayAgain}
          autoFocus
        >
          Play again
        </button>
        <button type="button" className="button ghost" onClick={onViewBoard}>
          View board
        </button>
      </div>
    </dialog>
  );
}
