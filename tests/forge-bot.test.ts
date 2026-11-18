import { describe, expect, it } from "vitest";
import { playBotTurn } from "../src/forge/bot";
import { newGame, transition } from "../src/forge/engine";

describe("Forge bot", () => {
  it("rolls and passes control back to the human", () => {
    const botTurn = transition(newGame(0), { type: "endTurn", now: 1 });
    const result = playBotTurn(botTurn, 8, 2);
    expect(result.actions[0]).toBe("Rolled 8");
    expect(result.game.turn).toBe(0);
    expect(result.game.phase).toBe("roll");
    expect(result.game.turnStarted).toBe(2);
    expect(botTurn.phase).toBe("roll");
  });

  it("does not play the human turn", () => {
    const game = newGame(0);
    expect(playBotTurn(game, 8, 2)).toEqual({ game, actions: [] });
  });

  it("finishes a game when its legal build reaches five points", () => {
    const botTurn = transition(newGame(0), { type: "endTurn", now: 1 });
    botTurn.phase = "build";
    botTurn.players[1].cities = [0, 1];
    botTurn.players[1].hand = { wood: 0, brick: 0, wheat: 2, ore: 3, sheep: 0 };
    const result = playBotTurn(botTurn, 8, 2);
    expect(result.game.phase).toBe("end");
    expect(result.game.winner).toBe(1);
  });
});
