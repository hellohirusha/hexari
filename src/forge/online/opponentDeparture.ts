/** Only report a departure after an explicit leave or a nonrecoverable timeout. */
export function isOpponentDeparture(code: unknown, recoverable: unknown) {
  return (
    recoverable !== true &&
    (code === "opponent_left" || code === "opponent_timeout")
  );
}
