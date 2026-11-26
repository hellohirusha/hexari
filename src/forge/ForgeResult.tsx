import { useEffect, useRef, type CSSProperties } from "react";
import BrandMark from "../shared/BrandMark";
import { totalPoints, type Game } from "./engine";
import ForgeDialogAction from "./ForgeDialogAction";
import "./ForgeCelebration.css";

export function formatGameDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`
    : `${minutes}:${remainder}`;
}

export function resultTitle(
  winner: number,
  bot: boolean,
  names?: [string, string],
  localSeat?: 0 | 1,
) {
  return bot || localSeat !== undefined
    ? winner === (localSeat ?? 0)
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
  onMainMenu,
  celebrate = true,
  localSeat,
}: {
  game: Game;
  bot: boolean;
  names?: [string, string];
  onViewBoard: () => void;
  onPlayAgain: () => void;
  onMainMenu: () => void;
  celebrate?: boolean;
  localSeat?: 0 | 1;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const winner = game.winner ?? 0;
  const defeat =
    localSeat !== undefined ? winner !== localSeat : bot && winner === 1;
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
      {celebrate && !defeat && (
        <div className="forge-celebration" aria-hidden="true">
          {Array.from({ length: 72 }, (_, index) => (
            <span
              key={index}
              style={
                {
                  "--confetti-x": `${index % 2 ? 24 : 76}%`,
                  "--confetti-drift": `${((index * 37) % 96) + 2 - (index % 2 ? 24 : 76)}vw`,
                  "--confetti-mid-drift": `${(((index * 37) % 96) + 2 - (index % 2 ? 24 : 76)) * 0.4}vw`,
                  "--confetti-delay": `${(index % 12) * 65}ms`,
                  "--confetti-duration": `${2.9 + (index % 7) * 0.22}s`,
                  "--confetti-spin": `${index % 2 ? 720 : -720}deg`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      <div className="forge-result-mark">
        <BrandMark variant="forge" />
      </div>
      <span className="forge-result-kicker">FORGE · GAME COMPLETE</span>
      <h2 id="forge-result-title">
        {resultTitle(winner, bot, names, localSeat)}
      </h2>
      <p>
        {bot
          ? defeat
            ? "The bot reached 5 points first."
            : "You reached 5 points first."
          : `${names?.[winner] ?? `Player ${winner + 1}`} reached 5 points first.`}
      </p>
      {game.gameStartedAt !== undefined && game.gameEndedAt !== undefined && (
        <div className="forge-result-stats">
          <span>
            Time: {formatGameDuration(game.gameEndedAt - game.gameStartedAt)}
          </span>
          {game.turnsPlayed !== undefined && (
            <span>Turns: {game.turnsPlayed}</span>
          )}
        </div>
      )}
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
        <ForgeDialogAction
          label="Play again"
          icon="replay"
          primary
          onClick={onPlayAgain}
          autoFocus
        />
        <ForgeDialogAction
          label="View board"
          icon="board"
          onClick={onViewBoard}
        />
        <ForgeDialogAction label="Main menu" icon="home" onClick={onMainMenu} />
      </div>
    </dialog>
  );
}
