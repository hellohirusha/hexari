export default function ForgeOpponentLeftNotice({
  onReturn,
  onFindGame,
  disconnected = false,
  timedOut = false,
  busy = false,
}: {
  onReturn: () => void;
  onFindGame: () => void;
  disconnected?: boolean;
  timedOut?: boolean;
  busy?: boolean;
}) {
  return (
    <section
      className="forge-opponent-toast"
      aria-label={disconnected ? "Opponent disconnected" : "Game ended"}
    >
      <div className="forge-opponent-toast-message" role="alert">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3 2.8 19h18.4L12 3Z" />
          <path d="M12 9v4.5m0 3h.01" />
        </svg>
        <div>
          <h2>{disconnected ? "Opponent disconnected" : "Opponent left"}</h2>
          <p>
            {timedOut
              ? "Your opponent did not reconnect. You can resume this saved game or find a new one."
              : disconnected
                ? "The game is paused while they reconnect. You can wait or leave the game."
                : "The other player is no longer in this game."}
          </p>
        </div>
      </div>
      <div className="forge-opponent-toast-actions">
        <button
          type="button"
          className="button ghost"
          onClick={onReturn}
          disabled={busy}
        >
          Return to menu
        </button>
        <button
          type="button"
          className="button primary"
          onClick={onFindGame}
          disabled={busy}
        >
          {busy ? "Leaving..." : "Find new game"}
        </button>
      </div>
    </section>
  );
}
