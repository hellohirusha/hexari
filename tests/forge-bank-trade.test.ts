import { describe, expect, it } from "vitest";
import {
  bankTradeOutcome,
  type PendingBankTrade,
} from "../src/forge/bankTrade";
import { newGame, transition } from "../src/forge/engine";

function tradeScenario() {
  const game = newGame(0);
  game.phase = "build";
  game.players[0].hand.wood = 5;
  const attempt: PendingBankTrade = {
    player: 0,
    give: "wood",
    receive: "ore",
    giveBefore: game.players[0].hand.wood,
    receiveBefore: game.players[0].hand.ore,
  };
  return { game, attempt };
}

describe("online bank trade confirmation", () => {
  it("waits for the confirmed state before reporting success", () => {
    const { game, attempt } = tradeScenario();
    const confirmed = transition(game, {
      type: "bank",
      give: "wood",
      receive: "ore",
    });
    expect(bankTradeOutcome(attempt, game, true)).toBe("waiting");
    expect(bankTradeOutcome(attempt, confirmed, false)).toBe("accepted");
  });

  it("reports a rejected command without treating another hand change as success", () => {
    const { game, attempt } = tradeScenario();
    expect(bankTradeOutcome(attempt, game, false)).toBe("rejected");
    const changed = structuredClone(game);
    changed.players[0].hand.wood -= 4;
    expect(bankTradeOutcome(attempt, changed, false)).toBe("rejected");
  });

  it("waits through a disconnect and recognizes a confirmed trade on reconnect", () => {
    const { game, attempt } = tradeScenario();
    const confirmed = transition(game, {
      type: "bank",
      give: "wood",
      receive: "ore",
    });
    expect(bankTradeOutcome(attempt, game, true)).toBe("waiting");
    expect(bankTradeOutcome(attempt, confirmed, true)).toBe("waiting");
    expect(bankTradeOutcome(attempt, confirmed, false)).toBe("accepted");
  });
});
