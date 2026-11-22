export default function ForgeOpponentLeftNotice({
  onReturn,
  onFindGame,
}: {
  onReturn: () => void;
  onFindGame: () => void;
}) {
  return (
    <section className="forge-opponent-toast" aria-label="Game ended">
      <div className="forge-opponent-toast-message" role="alert">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3 2.8 19h18.4L12 3Z" />
          <path d="M12 9v4.5m0 3h.01" />
        </svg>
        <div>
          <h2>Opponent left</h2>
          <p>The other player is no longer in this game.</p>
        </div>
      </div>
      <div className="forge-opponent-toast-actions">
        <button type="button" className="button ghost" onClick={onReturn}>
          Return to menu
        </button>
        <button type="button" className="button primary" onClick={onFindGame}>
          Find new game
        </button>
      </div>
    </section>
  );
}
