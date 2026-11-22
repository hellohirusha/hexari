import { describe, expect, it } from "vitest";
import { defaultBoard, vertices } from "../src/forge/board";
import { buildOptions } from "../src/forge/buildOptions";
import { forgeCoachState } from "../src/forge/coachContext";
import { newGame, transition } from "../src/forge/engine";

describe("Forge coach context", () => {
  it("passes only the last three bounded advice entries for the current player", () => {
    const game = newGame(0);
    const history = Array.from({ length: 4 }, (_, index) => ({
      question: `Question ${index}`,
      advice: "x".repeat(700),
    }));
    const state = forgeCoachState(game, "Build", history);
    expect(state.history).toHaveLength(3);
    expect(state.history[0].question).toBe("Question 1");
    expect(state.history.every((entry) => entry.advice.length === 600)).toBe(
      true,
    );
  });
  it("describes the actual production at each player's buildings without exposing the opponent's hand", () => {
    const game = newGame(0);
    game.players[1].hand.ore = 73;
    const state = forgeCoachState(game, "What should I build?");
    const ownCorner = game.players[0].settlements[0];
    for (const id of vertices[ownCorner].tiles) {
      const tile = defaultBoard[id];
      expect(state.buildings).toContain(
        tile.number === null
          ? tile.resource
          : `${tile.resource} ${tile.number}`,
      );
    }
    expect(state.buildings).toContain(`corner ${ownCorner + 1}`);
    expect(state.opponents).toContain("Opponent hand is hidden");
    expect(JSON.stringify(state)).not.toContain("73");
    expect(state.buildings.length).toBeLessThanOrEqual(2000);
    expect(state.opponents.length).toBeLessThanOrEqual(2000);
  });

  it("reports build costs, legal locations, affordability and the current phase", () => {
    const beforeRoll = newGame(0);
    expect(forgeCoachState(beforeRoll, "Build").buildings).toContain(
      "roll before building or trading",
    );
    expect(forgeCoachState(beforeRoll, "Build").buildings).toContain(
      "current hand 5 cards, 2 spaces free",
    );
    beforeRoll.players[0].hand.ore = 3;
    expect(forgeCoachState(beforeRoll, "Build").buildings).toContain(
      "current hand 7 cards, 0 spaces free",
    );
    const game = transition(beforeRoll, { type: "roll", total: 7 });
    const roads = buildOptions(game, "road");
    const context = forgeCoachState(game, "Build").buildings;
    expect(context).toContain("dice have been rolled");
    expect(context).toContain(
      `road costs 1 wood, 1 brick; affordable; ${roads.edges.length} legal locations`,
    );
    expect(context).toContain("city costs 2 wheat, 3 ore; not affordable");
    expect(context).toContain("Bank trades exchange four matching cards");
    expect(context).not.toMatch(/farms?|markets?/i);
  });
});
