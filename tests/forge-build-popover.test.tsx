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
  it("offers a free starting road only on an edge attached to the starting settlement", () => {
    const game = newGame(0, { manualSetup: true });
    const at = bestSetupSettlement(game)!;
    const placed = transition(game, {
      type: "build",
      building: "settlement",
      at,
      now: 1,
    });
    const to = vertices[at].neighbors[0];
    const html = renderToStaticMarkup(
      <ForgeBuildPopover
        game={placed}
        target={{ at, to }}
        onBuild={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Starting road"');
    expect(html).not.toContain("forge-cost-icon");
    expect(html.toLowerCase()).not.toContain("free");
    expect(html).not.toContain('disabled=""');
  });
  it("shows only the settlement icon on a legal starting corner", () => {
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
    expect(html).toContain('aria-label="Starting settlement"');
    expect(html).not.toContain("forge-cost-icon");
    expect(html.toLowerCase()).not.toContain("free");
    expect(html).not.toContain("Close build options");
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain(">Free</span>");
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

  it("does not offer roads when selecting a corner", () => {
    const game = transition(newGame(0), { type: "roll", total: 2 });
    const at = game.players[game.turn].settlements[0];
    const html = renderToStaticMarkup(
      <ForgeBuildPopover
        game={game}
        target={{ at }}
        onBuild={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).not.toContain('aria-label="Road');
    expect(html).toContain('aria-label="City,');
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
    expect(html).not.toContain('aria-label="Starting settlement,');
    expect(html).toContain("No builds available here.");
    expect(html).toContain('class="forge-build-empty"');
  });

  it("offers a city upgrade only at the current player's settlement", () => {
    const game = transition(newGame(0), { type: "roll", total: 6 });
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

  it("shows disabled build choices at the player's settlement before rolling", () => {
    const game = newGame(0);
    const html = renderToStaticMarkup(
      <ForgeBuildPopover
        game={game}
        target={{ at: game.players[0].settlements[0] }}
        onBuild={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("City, 2 wheat, 3 ore");
    expect(html).not.toContain("Road to");
    expect(html).toContain("roll first");
    expect(html).toContain('disabled=""');
  });
});
