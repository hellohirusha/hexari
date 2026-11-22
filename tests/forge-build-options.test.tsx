import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { vertices } from "../src/forge/board";
import { buildKinds, buildOptions } from "../src/forge/buildOptions";
import ForgeBuildCards from "../src/forge/ForgeBuildCards";
import { newGame, transition } from "../src/forge/engine";

describe("Forge build availability", () => {
  it("requires a roll, resources and a legal road location", () => {
    const fresh = newGame(0);
    expect(buildOptions(fresh, "road").available).toBe(false);
    const rolled = transition(fresh, { type: "roll", total: 7 });
    const roads = buildOptions(rolled, "road");
    expect(roads.available).toBe(true);
    expect(roads.edges.length).toBeGreaterThan(0);
    expect(
      roads.edges.every(([a, b]) => vertices[a].neighbors.includes(b)),
    ).toBe(true);
    rolled.players[0].hand.brick = 0;
    expect(buildOptions(rolled, "road").available).toBe(false);
  });
  it("finds settlement and city locations using the game rules", () => {
    const game = transition(newGame(0), { type: "roll", total: 7 });
    game.players[0].hand = { wood: 3, brick: 1, wheat: 2, ore: 3, sheep: 1 };
    const start = game.players[0].settlements[0];
    const firstRoad = buildOptions(game, "road").edges[0];
    game.players[0].roads = [firstRoad];
    expect(buildOptions(game, "settlement").available).toBe(false);
    expect(buildOptions(game, "city").corners).toEqual([start]);
    expect(buildKinds).toEqual(["road", "settlement", "city"]);
  });
  it("renders accessible cards with truthful availability", () => {
    const game = transition(newGame(0), { type: "roll", total: 7 });
    const html = renderToStaticMarkup(
      <ForgeBuildCards
        game={game}
        botTurn={false}
        selected="road"
        onSelect={() => {}}
      />,
    );
    expect(html).toContain("Road. 1 wood, 1 brick. Choose a location.");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Settlement.");
    expect(html).toContain("City.");
    expect(html).not.toMatch(/Farm\.|Market\./);
    expect(html).toContain("Not enough resources");
  });
});
