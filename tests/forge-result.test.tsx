import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ForgeResult from "../src/forge/ForgeResult";
import { newGame } from "../src/forge/engine";

describe("Forge game results", () => {
  it.each([
    { bot: true, winner: 0, expected: "Victory" },
    { bot: true, winner: 1, expected: "Defeat" },
    { bot: false, winner: 1, expected: "Player 2 wins" },
  ])("shows $expected for the actual winner", ({ bot, winner, expected }) => {
    const game = newGame(0);
    game.phase = "end";
    game.winner = winner;
    game.players[winner].cities = [0, 1];
    const html = renderToStaticMarkup(
      <ForgeResult
        game={game}
        bot={bot}
        onViewBoard={() => {}}
        onPlayAgain={() => {}}
      />,
    );
    expect(html).toContain(expected);
    expect(html).toContain("5 <small>VP</small>");
    expect(html).toContain("View board");
    expect(html).toContain("Play again");
  });
});
