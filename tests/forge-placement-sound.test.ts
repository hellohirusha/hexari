import { describe, expect, it } from "vitest";
import { vertices } from "../src/forge/board";
import { legalRoad, newGame, transition } from "../src/forge/engine";
import { placementSound } from "../src/forge/placementSound";

describe("Forge placement sounds", () => {
  it("recognizes a player's free starting settlement", () => {
    const before = newGame(0, { manualSetup: true });
    const after = transition(before, {
      type: "build",
      building: "settlement",
      at: 23,
      now: 1,
    });
    expect(placementSound(before, after)).toBe("settlement");
    expect(placementSound(after, after)).toBeNull();
  });

  it("distinguishes a road from an upgrade replacing a settlement", () => {
    const before = transition(newGame(0), { type: "roll", total: 7 });
    const at = before.players[0].settlements[0];
    const to = vertices[at].neighbors.find((id) => legalRoad(before, at, id))!;
    const road = transition(before, {
      type: "build",
      building: "road",
      at,
      to,
      now: 1,
    });
    expect(placementSound(before, road)).toBe("road");

    const cityGame = structuredClone(before);
    cityGame.players[0].hand = {
      wood: 0,
      brick: 0,
      wheat: 2,
      ore: 3,
      sheep: 0,
    };
    const city = transition(cityGame, {
      type: "build",
      building: "city",
      at,
      now: 1,
    });
    expect(placementSound(cityGame, city)).toBe("city");
    expect(city.players[0].settlements).not.toContain(at);
  });

  it("recognizes a settlement placed later in the game", () => {
    const game = transition(newGame(0), { type: "roll", total: 7 });
    const at = game.players[0].settlements[0];
    const next = vertices[at].neighbors[0];
    const destination = vertices[next].neighbors.find((id) => id !== at)!;
    game.players[0].roads = [
      [at, next],
      [next, destination],
    ];
    game.players[0].hand = {
      wood: 1,
      brick: 1,
      wheat: 1,
      ore: 0,
      sheep: 1,
    };
    const placed = transition(game, {
      type: "build",
      building: "settlement",
      at: destination,
      now: 1,
    });
    expect(placementSound(game, placed)).toBe("settlement");
  });

  it("ignores rolls and unchanged roads with reversed endpoints", () => {
    const before = newGame(0);
    before.players[0].roads = [[1, 2]];
    const after = transition(before, { type: "roll", total: 7 });
    after.players[0].roads = [[2, 1]];
    expect(placementSound(before, after)).toBeNull();
  });
});
