/** Short player labels keep the turn indicator readable for long nicknames. */
export function turnLabel(
  mode: "bot" | "online" | "hotseat",
  viewerSeat: number,
  playerSeat: number,
  finished: boolean,
): string {
  const player =
    mode === "hotseat"
      ? `Player ${playerSeat + 1}`
      : playerSeat === viewerSeat
        ? "You"
        : mode === "bot"
          ? "Bot"
          : "Opponent";
  if (!finished) return player;
  return player === "You" ? "You win!" : `${player} wins!`;
}
