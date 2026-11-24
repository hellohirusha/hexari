import { bankRate, type Game, type Goods } from "./engine";

export type PendingBankTrade = {
  player: number;
  give: Goods;
  receive: Goods;
  giveBefore: number;
  receiveBefore: number;
};

/** Wait for a response or reconnection, then compare the confirmed hand. */
export function bankTradeOutcome(
  attempt: PendingBankTrade,
  game: Game,
  waiting: boolean,
): "waiting" | "accepted" | "rejected" {
  if (waiting) return "waiting";
  const after = game.players[attempt.player]?.hand;
  return after &&
    after[attempt.give] === attempt.giveBefore - bankRate() &&
    after[attempt.receive] === attempt.receiveBefore + 1
    ? "accepted"
    : "rejected";
}
