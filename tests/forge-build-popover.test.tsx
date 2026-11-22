import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ForgeBuildPopover from "../src/forge/ForgeBuildPopover";
import {
  bestSetupSettlement,
  legalRoad,
  newGame,
  transition,
} from "../src/forge/engine";
import { vertices } from "../src/forge/board";

describe("starting placement choices", () => {
  it("offers a free settlement on a legal starting corner", () => {
    const game = newGame(0, { manualSetup: true });
    const at = bestSetupSettlement(game)!;
    const html = renderToStaticMarkup(
      <ForgeBuildPopover
        game={game}
        target={{ at }}
        onBuild={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Starting settlement, free"');
    expect(html).not.toContain("Close build options");
    expect(html).not.toContain('disabled=""');
    expect(html).toContain(">Free</span>");
    expect(game.players[0].settlements).toEqual([]);
  });

  it("shows road costs and marks a resource the player cannot afford", () => {
    const game = transition(newGame(0), { type: "roll", total: 2 });
    const from = game.players[game.turn].settlements[0];
    const to = vertices[from].neighbors.find((neighbor) =>
      legalRoad(game, from, neighbor),
    )!;
    game.players[game.turn].hand.wood = 0;
    game.players[game.turn].hand.brick = 1;
    const html = renderToStaticMarkup(
      <ForgeBuildPopover
        game={game}
        target={{ at: from, to }}
        onBuild={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain(
      'aria-label="Road, 1 wood, 1 brick, not enough resources"',
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('class="forge-cost-short"');
    expect(html.match(/class="forge-cost-icon"/g)).toHaveLength(2);
  });

  it("gives roads from one corner distinct visible directions", () => {
    const game = transition(newGame(0), { type: "roll", total: 2 });
    const at = game.players[game.turn].settlements[0];
    const html = renderToStaticMarkup(
      <ForgeBuildPopover
        game={game}
        target={{ at }}
        selectedBuilding="road"
        onBuild={() => {}}
        onClose={() => {}}
      />,
    );
    const directions = [
      ...html.matchAll(
        /class="forge-road-direction" aria-hidden="true">([^<]+)</g,
      ),
    ].map((match) => match[1]);
    expect(directions.length).toBeGreaterThan(1);
    expect(new Set(directions).size).toBe(directions.length);
  });

  it("does not offer a settlement at an occupied starting corner", () => {
    const game = newGame(0, { manualSetup: true });
    const at = bestSetupSettlement(game)!;
    const next = transition(game, {
      type: "build",
      building: "settlement",
      at,
      now: 1,
    });
    const html = renderToStaticMarkup(
      <ForgeBuildPopover
        game={next}
        target={{ at }}
        onBuild={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).not.toContain('aria-label="Starting settlement, free"');
    expect(html).toContain("No builds available here.");
    expect(html).toContain('class="forge-build-empty"');
  });

  it("offers a city upgrade only at the current player's settlement", () => {
    const game = transition(newGame(0), { type: "roll", total: 7 });
    game.players[0].hand = { wood: 0, brick: 0, wheat: 2, ore: 3, sheep: 0 };
    const renderAt = (at: number) =>
      renderToStaticMarkup(
        <ForgeBuildPopover
          game={game}
          target={{ at }}
          onBuild={() => {}}
          onClose={() => {}}
        />,
      );
    const own = renderAt(game.players[0].settlements[0]);
    expect(own).toContain('aria-label="City, 2 wheat, 3 ore"');
    expect(own).not.toMatch(/Farm|Market/);
    const opponent = renderAt(game.players[1].settlements[0]);
    expect(opponent).not.toContain('aria-label="City,');
  });
});
