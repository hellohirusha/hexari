import { describe, expect, it, vi } from "vitest";
import { legalSetupRoad, newGame } from "../src/forge/engine";
import { vertices } from "../src/forge/board";
import {
  applyOnlineCommand,
  timeoutOnlineTurn,
  type OnlineSession,
} from "../src/forge/online/session";

const roll = () => [3, 5] as [number, number];
const initial = (): OnlineSession => ({
  game: newGame(0),
  revision: 0,
  offer: null,
});

describe("online turn protocol", () => {
  it("requires each online player to place a road after their starting settlement", () => {
    const saved: OnlineSession = {
      game: newGame(0, { manualSetup: true }),
      revision: 0,
      offer: null,
    };
    const first = applyOnlineCommand(
      saved,
      0,
      0,
      { type: "build", building: "settlement", at: 23 },
      1,
      roll,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstRoad = applyOnlineCommand(
      first.session,
      0,
      1,
      {
        type: "build",
        building: "road",
        at: 23,
        to: vertices[23].neighbors[0],
      },
      2,
      roll,
    );
    expect(firstRoad.ok).toBe(true);
    if (!firstRoad.ok) return;
    const second = applyOnlineCommand(
      firstRoad.session,
      1,
      2,
      { type: "build", building: "settlement", at: 38 },
      3,
      roll,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.session.game.phase).toBe("setup");
    const to = vertices[38].neighbors.find((neighbor) =>
      legalSetupRoad(second.session.game, 38, neighbor),
    )!;
    const secondRoad = applyOnlineCommand(
      second.session,
      1,
      3,
      { type: "build", building: "road", at: 38, to },
      4,
      roll,
    );
    expect(secondRoad.ok).toBe(true);
    if (!secondRoad.ok) return;
    expect(secondRoad.session.game.phase).toBe("roll");
    expect(secondRoad.session.game.turn).toBe(0);
    expect(
      secondRoad.session.game.players.map((player) => player.settlements),
    ).toEqual([[23], [38]]);
    expect(
      secondRoad.session.game.players.map((player) => player.roads.length),
    ).toEqual([1, 1]);
  });
  it("preserves both nicknames through game actions and trade responses", () => {
    const start = initial();
    start.names = ["AmberFox#1234", "Blue"];
    start.game.phase = "build";
    start.game.players[0].hand.wood = 1;
    start.game.players[1].hand.ore = 1;
    const offered = applyOnlineCommand(
      start,
      0,
      0,
      { type: "offer", give: "wood", receive: "ore" },
      1,
      roll,
    );
    expect(offered.ok).toBe(true);
    if (!offered.ok) return;
    expect(offered.session.names).toEqual(start.names);
    const accepted = applyOnlineCommand(
      offered.session,
      1,
      1,
      { type: "accept" },
      2,
      roll,
    );
    expect(accepted.ok && accepted.session.names).toEqual(start.names);
    if (!accepted.ok) return;
    const ended = applyOnlineCommand(
      accepted.session,
      0,
      2,
      { type: "endTurn" },
      3,
      roll,
    );
    expect(ended.ok && ended.session.names).toEqual(start.names);
  });
  it("requires a roll before a player can end the turn", () => {
    const start = initial();
    const result = applyOnlineCommand(
      start,
      0,
      0,
      { type: "endTurn" },
      1,
      roll,
    );
    expect(result).toEqual({
      ok: false,
      reason: "Roll before ending your turn.",
    });
    expect(start.game.turn).toBe(0);
  });
  it("rolls automatically and advances an expired unrolled turn", () => {
    const result = timeoutOnlineTurn(initial(), 120000, roll);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dice).toEqual([3, 5]);
    expect(result.session.game.turn).toBe(1);
    expect(result.session.game.phase).toBe("roll");
    expect(result.session.revision).toBe(2);
  });
  it("rejects stale and out-of-turn actions before rolling", () => {
    const random = vi.fn(roll);
    expect(
      applyOnlineCommand(initial(), 1, 0, { type: "roll" }, 1, random).ok,
    ).toBe(false);
    expect(
      applyOnlineCommand(initial(), 0, 4, { type: "roll" }, 1, random).ok,
    ).toBe(false);
    expect(random).not.toHaveBeenCalled();
    const result = applyOnlineCommand(
      initial(),
      0,
      0,
      { type: "roll" },
      1,
      random,
    );
    expect(result.ok && result.session.game.dice).toBe(8);
    expect(result.ok && result.session.revision).toBe(1);
  });
  it("requires the other player to accept an offer before cards move", () => {
    const start = initial();
    start.game.phase = "build";
    start.game.players[0].hand.wood = 1;
    start.game.players[1].hand.ore = 1;
    const offer = applyOnlineCommand(
      start,
      0,
      0,
      { type: "offer", give: "wood", receive: "ore" },
      1,
      roll,
    );
    if (!offer.ok) throw new Error(offer.reason);
    expect(offer.session.game.players[0].hand.wood).toBe(1);
    expect(
      applyOnlineCommand(offer.session, 0, 1, { type: "accept" }, 2, roll).ok,
    ).toBe(false);
    const accepted = applyOnlineCommand(
      offer.session,
      1,
      1,
      { type: "accept" },
      2,
      roll,
    );
    expect(accepted.ok && accepted.session.game.players[0].hand.ore).toBe(1);
    expect(accepted.ok && accepted.session.offer).toBeNull();
  });
  it("rejects malformed resource and building requests without altering state", () => {
    const start = initial();
    start.game.phase = "build";
    const invalid = { type: "bank", give: "fake", receive: "ore" } as never;
    expect(applyOnlineCommand(start, 0, 0, invalid, 1, roll).ok).toBe(false);
    expect(start.revision).toBe(0);
    expect(start.game.players[0].hand.wood).toBe(0);
  });

  it("keeps an automatic seven roll and waits for the robber action", () => {
    const result = timeoutOnlineTurn(initial(), 120000, () => [3, 4]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dice).toEqual([3, 4]);
    expect(result.session.game.phase).toBe("robber");
    expect(result.session.game.turn).toBe(0);
    expect(result.session.game.turnStarted).toBe(120000);
    expect(result.session.revision).toBe(1);
  });
});
