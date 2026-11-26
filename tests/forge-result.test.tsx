import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ForgeResult, { formatGameDuration } from "../src/forge/ForgeResult";
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
        onMainMenu={() => {}}
      />,
    );
    expect(html).toContain(expected);
    expect(html).toContain("5 <small>VP</small>");
    expect(html).toContain('aria-label="View board"');
    expect(html).toContain('aria-label="Play again"');
    expect(html).toContain('aria-label="Main menu"');
  });
  it("shows the players' nicknames on the result screen", () => {
    const game = newGame(0);
    game.phase = "end";
    game.winner = 1;
    const html = renderToStaticMarkup(
      <ForgeResult
        game={game}
        bot={false}
        names={["AmberFox#1234", "SilverWolf#5678"]}
        onViewBoard={() => {}}
        onPlayAgain={() => {}}
        onMainMenu={() => {}}
      />,
    );
    expect(html).toContain("SilverWolf#5678 wins");
    expect(html).toContain("AmberFox#1234");
  });
  it("shows elapsed time and turns and does not replay particles on reopening", () => {
    const game = {
      ...newGame(0),
      phase: "end" as const,
      winner: 1,
      gameStartedAt: 1000,
      gameEndedAt: 126000,
      turnsPlayed: 18,
    };
    const html = renderToStaticMarkup(
      <ForgeResult
        game={game}
        bot={false}
        localSeat={0}
        celebrate={false}
        onViewBoard={() => {}}
        onPlayAgain={() => {}}
        onMainMenu={() => {}}
      />,
    );
    expect(html).toContain("Time: 2:05");
    expect(html).toContain("Turns: 18");
    expect(html).toContain("forge-result-defeat");
    expect(html).toContain(">Defeat</h2>");
    expect(html).not.toContain("forge-celebration");
    expect(formatGameDuration(3_723_000)).toBe("1:02:03");
  });
  it("shows victory from the online player's perspective", () => {
    const game = { ...newGame(0), phase: "end" as const, winner: 1 };
    const html = renderToStaticMarkup(
      <ForgeResult
        game={game}
        bot={false}
        localSeat={1}
        onViewBoard={() => {}}
        onPlayAgain={() => {}}
        onMainMenu={() => {}}
      />,
    );
    expect(html).toContain(">Victory</h2>");
    expect(html).toContain("forge-celebration");
    expect((html.match(/--confetti-x:/g) ?? []).length).toBe(72);
  });
  it("does not display falling particles after a defeat", () => {
    const game = { ...newGame(0), phase: "end" as const, winner: 1 };
    const html = renderToStaticMarkup(
      <ForgeResult
        game={game}
        bot
        onViewBoard={() => {}}
        onPlayAgain={() => {}}
        onMainMenu={() => {}}
      />,
    );
    expect(html).toContain(">Defeat</h2>");
    expect(html).not.toContain("forge-celebration");
  });
  it("does not replay victory confetti after the result is reopened", () => {
    const game = { ...newGame(0), phase: "end" as const, winner: 0 };
    const html = renderToStaticMarkup(
      <ForgeResult
        game={game}
        bot
        celebrate={false}
        onViewBoard={() => {}}
        onPlayAgain={() => {}}
        onMainMenu={() => {}}
      />,
    );
    expect(html).toContain(">Victory</h2>");
    expect(html).not.toContain("forge-celebration");
  });
});
