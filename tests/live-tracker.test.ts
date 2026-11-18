import { describe, expect, it } from "vitest";
import { beliefSummary } from "../src/hexari/engine/belief";
import { defaultBoard, vertices } from "../src/shared/board";
import {
  recordLiveEvent,
  startSession,
} from "../src/hexari/engine/liveTracker";
import { emptyHand } from "../src/forge/engine";

describe("live tracker uncertainty", () => {
  it("conditions uncertain hands on a mixed trade and transfers both bundles", () => {
    const start = startSession([
      { name: "A", corners: "", hand: { ...emptyHand(), wood: 1 } },
      { name: "B", corners: "", hand: { ...emptyHand(), brick: 1, ore: 1 } },
    ])!;
    const stolen = recordLiveEvent(
      start,
      { type: "unknownSteal", player: 0, other: 1 },
      defaultBoard,
    )!;
    const next = recordLiveEvent(
      stolen,
      {
        type: "bundleTrade",
        player: 0,
        other: 1,
        give: { ...emptyHand(), wood: 1, brick: 1 },
        receive: { ...emptyHand(), ore: 1 },
      },
      defaultBoard,
    )!;
    expect(next.worlds).toHaveLength(1);
    expect(next.worlds[0].probability).toBe(1);
    expect(next.worlds[0].hands[0]).toEqual({ ...emptyHand(), ore: 1 });
    expect(next.worlds[0].hands[1]).toEqual({
      ...emptyHand(),
      wood: 1,
      brick: 1,
    });
    expect(next.history[0]).toContain("1 wood, 1 brick for 1 ore");
  });
  it("records observed bank exchanges without changing another player's hand", () => {
    const start = startSession([
      { name: "A", corners: "", hand: { ...emptyHand(), wood: 4 } },
      { name: "B", corners: "", hand: { ...emptyHand(), ore: 3 } },
    ])!;
    const event = {
      type: "bundleTrade" as const,
      player: 0,
      other: null,
      give: { ...emptyHand(), wood: 4 },
      receive: { ...emptyHand(), wheat: 1 },
    };
    const next = recordLiveEvent(start, event, defaultBoard)!;
    expect(next.worlds[0].hands[0]).toEqual({ ...emptyHand(), wheat: 1 });
    expect(next.worlds[0].hands[1]).toEqual(start.worlds[0].hands[1]);
    expect(next.history[0]).toContain("the bank");
    expect(
      recordLiveEvent(
        start,
        { ...event, give: { ...emptyHand(), wood: 5 } },
        defaultBoard,
      ),
    ).toBeNull();
  });
  it("rejects invalid bundle trades without changing any hand", () => {
    const start = startSession([
      { name: "A", corners: "", hand: { ...emptyHand(), wood: 2 } },
      { name: "B", corners: "", hand: { ...emptyHand(), ore: 1 } },
    ])!;
    const base = {
      type: "bundleTrade" as const,
      player: 0,
      other: 1,
      give: { ...emptyHand(), wood: 1 },
      receive: { ...emptyHand(), ore: 1 },
    };
    for (const event of [
      { ...base, give: emptyHand() },
      { ...base, give: { ...emptyHand(), wood: -1 } },
      { ...base, receive: { ...emptyHand(), wood: 1 } },
      { ...base, receive: { ...emptyHand(), ore: 2 } },
      { ...base, other: 0 },
    ])
      expect(recordLiveEvent(start, event, defaultBoard)).toBeNull();
    expect(start.worlds[0].hands[0].wood).toBe(2);
    expect(start.worlds[0].hands[1].ore).toBe(1);
  });
  it("records a multi-card trade and updates both hands atomically", () => {
    const start = startSession([
      { name: "A", corners: "", hand: { ...emptyHand(), wood: 3 } },
      { name: "B", corners: "", hand: { ...emptyHand(), ore: 2 } },
    ])!;
    const event = {
      type: "trade" as const,
      player: 0,
      other: 1,
      give: "wood" as const,
      receive: "ore" as const,
      giveCount: 2,
      receiveCount: 1,
    };
    const next = recordLiveEvent(start, event, defaultBoard)!;
    expect(next.worlds[0].hands[0]).toMatchObject({ wood: 1, ore: 1 });
    expect(next.worlds[0].hands[1]).toMatchObject({ wood: 2, ore: 1 });
    expect(next.history[0]).toContain("2 wood for 1 ore");
    expect(
      recordLiveEvent(start, { ...event, giveCount: 4 }, defaultBoard),
    ).toBeNull();
    expect(start.worlds[0].hands[0].wood).toBe(3);
  });
  it("rejects starting settlements adjacent to another player's building", () => {
    const adjacent = vertices[0].neighbors[0];
    expect(
      startSession([
        { name: "A", corners: "1", hand: emptyHand() },
        { name: "B", corners: String(adjacent + 1), hand: emptyHand() },
      ]),
    ).toBeNull();
  });
  it("carries an unknown steal through a roll and conditions on a later known build", () => {
    const session = startSession([
      { name: "A", corners: "", hand: emptyHand() },
      { name: "B", corners: "", hand: { ...emptyHand(), wood: 1, brick: 1 } },
    ])!;
    const stolen = recordLiveEvent(
      session,
      { type: "unknownSteal", player: 0, other: 1 },
      defaultBoard,
    )!;
    expect(beliefSummary(stolen.worlds, 0, "wood")).toEqual([
      { count: 0, probability: 0.5 },
      { count: 1, probability: 0.5 },
    ]);
    const rolled = recordLiveEvent(
      stolen,
      { type: "roll", number: 7 },
      defaultBoard,
    )!;
    const observed = recordLiveEvent(
      rolled,
      { type: "trade", player: 0, other: 1, give: "wood", receive: "brick" },
      defaultBoard,
    )!;
    expect(observed.worlds).toHaveLength(1);
    expect(beliefSummary(observed.worlds, 0, "brick")).toEqual([
      { count: 1, probability: 1 },
    ]);
    expect(observed.history).toHaveLength(3);
    expect(observed.rolls).toEqual([7]);
  });
  it("rejects an impossible action without changing the session", () => {
    const session = startSession([
      { name: "A", corners: "", hand: emptyHand() },
      { name: "B", corners: "", hand: emptyHand() },
    ])!;
    expect(
      recordLiveEvent(
        session,
        { type: "unknownSteal", player: 0, other: 1 },
        defaultBoard,
      ),
    ).toBeNull();
    expect(session.history).toEqual([]);
  });
  it("updates a new settlement and then a city, doubling its future production", () => {
    const corner = vertices.find((v) =>
      v.tiles.some((t) => defaultBoard[t].resource !== "desert"),
    )!;
    const tile =
      defaultBoard[
        corner.tiles.find((t) => defaultBoard[t].resource !== "desert")!
      ];
    const hand = { wood: 1, brick: 1, wheat: 3, ore: 3, sheep: 1 };
    const started = startSession([
      { name: "A", corners: "", hand },
      { name: "B", corners: "", hand: emptyHand() },
    ])!;
    const settlement = recordLiveEvent(
      started,
      { type: "build", player: 0, building: "settlement", corner: corner.id },
      defaultBoard,
    )!;
    expect(settlement.players[0].corners).toBe(String(corner.id + 1));
    const city = recordLiveEvent(
      settlement,
      { type: "build", player: 0, building: "city", corner: corner.id },
      defaultBoard,
    )!;
    expect(city.players[0].corners).toBe("");
    expect(city.players[0].cities).toEqual([corner.id]);
    const rolled = recordLiveEvent(
      city,
      { type: "roll", number: tile.number! },
      defaultBoard,
    )!;
    const matching = corner.tiles.filter(
      (id) =>
        defaultBoard[id].number === tile.number &&
        defaultBoard[id].resource === tile.resource,
    ).length;
    if (tile.resource === "desert") throw new Error("Expected producing tile");
    expect(rolled.worlds[0].hands[0][tile.resource]).toBe(
      city.worlds[0].hands[0][tile.resource] + 2 * matching,
    );
    expect(started.players[0].corners).toBe("");
  });
  it("rejects invalid or occupied building locations without spending resources", () => {
    const start = startSession([
      {
        name: "A",
        corners: "1",
        hand: { wood: 2, brick: 2, wheat: 3, ore: 3, sheep: 2 },
      },
      { name: "B", corners: "", hand: emptyHand() },
    ])!;
    expect(
      recordLiveEvent(
        start,
        { type: "build", player: 0, building: "city", corner: 1 },
        defaultBoard,
      ),
    ).toBeNull();
    expect(
      recordLiveEvent(
        start,
        { type: "build", player: 0, building: "settlement", corner: 0 },
        defaultBoard,
      ),
    ).toBeNull();
    expect(start.worlds[0].hands[0].ore).toBe(3);
    expect(
      startSession([
        { name: "A", corners: "1, bad", hand: emptyHand() },
        { name: "B", corners: "", hand: emptyHand() },
      ]),
    ).toBeNull();
    expect(
      startSession([
        { name: "A", corners: "1", hand: emptyHand() },
        { name: "B", corners: "1", hand: emptyHand() },
      ]),
    ).toBeNull();
  });
  it("uses an exact hand correction while retaining other players' uncertainty", () => {
    const start = startSession([
      { name: "A", corners: "", hand: emptyHand() },
      { name: "B", corners: "", hand: { ...emptyHand(), wood: 1, brick: 1 } },
    ])!;
    const stolen = recordLiveEvent(
      start,
      { type: "unknownSteal", player: 0, other: 1 },
      defaultBoard,
    )!;
    const fixed = recordLiveEvent(
      stolen,
      { type: "handCorrection", player: 0, hand: { ...emptyHand(), ore: 2 } },
      defaultBoard,
    )!;
    expect(beliefSummary(fixed.worlds, 0, "ore")).toEqual([
      { count: 2, probability: 1 },
    ]);
    expect(beliefSummary(fixed.worlds, 1, "wood")).toHaveLength(2);
    expect(
      fixed.worlds.reduce((sum, world) => sum + world.probability, 0),
    ).toBeCloseTo(1);
  });
  it("keeps a session on its original board after the editor changes", () => {
    const corner = vertices.find((v) =>
      v.tiles.some((t) => defaultBoard[t].resource === "wood"),
    )!;
    const tileId = corner.tiles.find(
      (id) => defaultBoard[id].resource === "wood",
    )!;
    const snapshot = defaultBoard.map((tile) => ({ ...tile }));
    const start = startSession(
      [
        { name: "A", corners: String(corner.id + 1), hand: emptyHand() },
        { name: "B", corners: "", hand: emptyHand() },
      ],
      snapshot,
    )!;
    const roll = snapshot[tileId].number!;
    snapshot[tileId] = { resource: "ore", number: roll };
    const next = recordLiveEvent(
      start,
      { type: "roll", number: roll },
      snapshot,
    )!;
    const wood = corner.tiles.filter(
      (id) =>
        defaultBoard[id].resource === "wood" &&
        defaultBoard[id].number === roll,
    ).length;
    expect(next.worlds[0].hands[0].wood).toBe(wood);
    expect(start.board![tileId].resource).toBe("wood");
  });
});
