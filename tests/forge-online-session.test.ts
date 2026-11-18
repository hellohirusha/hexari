import { describe, expect, it, vi } from "vitest";
import { newGame } from "../src/forge/engine";
import {
  applyOnlineCommand,
  type OnlineSession,
} from "../src/forge/online/session";

const roll = () => [3, 5] as [number, number];
const initial = (): OnlineSession => ({
  game: newGame(0),
  revision: 0,
  offer: null,
});

describe("online turn protocol", () => {
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
    expect(accepted.ok && accepted.session.game.players[0].hand.ore).toBe(2);
    expect(accepted.ok && accepted.session.offer).toBeNull();
  });
  it("rejects malformed resource and building requests without altering state", () => {
    const start = initial();
    start.game.phase = "build";
    const invalid = { type: "bank", give: "fake", receive: "ore" } as never;
    expect(applyOnlineCommand(start, 0, 0, invalid, 1, roll).ok).toBe(false);
    expect(start.revision).toBe(0);
    expect(start.game.players[0].hand.wood).toBe(1);
  });
});
