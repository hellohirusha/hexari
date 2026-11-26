import { describe, expect, it } from "vitest";
import { transfersForAction } from "../src/forge/resourceTransfers";

describe("Forge resource movements", () => {
  it("moves the cost of regular builds to the bank without charging setup pieces", () => {
    expect(
      transfersForAction({ type: "build", actor: 0, building: "road" }),
    ).toEqual([
      { resource: "wood", amount: 1, from: 0, to: "bank" },
      { resource: "brick", amount: 1, from: 0, to: "bank" },
    ]);
    expect(
      transfersForAction({
        type: "build",
        actor: 0,
        building: "settlement",
        setup: true,
      }),
    ).toEqual([]);
    expect(
      transfersForAction({
        type: "build",
        actor: 0,
        building: "road",
        setup: true,
      }),
    ).toEqual([]);
  });
  it("shows both directions of bank and player trades", () => {
    expect(
      transfersForAction({
        type: "bank",
        actor: 1,
        give: "wood",
        receive: "ore",
      }),
    ).toEqual([
      { resource: "wood", amount: 4, from: 1, to: "bank" },
      { resource: "ore", amount: 1, from: "bank", to: 1 },
    ]);
    expect(
      transfersForAction({
        type: "trade",
        actor: 0,
        other: 1,
        give: "wood",
        receive: "ore",
      }),
    ).toEqual([
      { resource: "wood", amount: 1, from: 0, to: 1 },
      { resource: "ore", amount: 1, from: 1, to: 0 },
    ]);
  });
  it("ignores malformed or unconfirmed events", () => {
    expect(
      transfersForAction({
        type: "offer",
        actor: 0,
        give: "wood",
        receive: "ore",
      }),
    ).toEqual([]);
    expect(
      transfersForAction({
        type: "bank",
        actor: 3,
        give: "wood",
        receive: "ore",
      }),
    ).toEqual([]);
    expect(
      transfersForAction({
        type: "trade",
        actor: 0,
        other: 0,
        give: "wood",
        receive: "ore",
      }),
    ).toEqual([]);
  });
});
