import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalForgeCoachHistory,
  readForgeCoachHistory,
  writeForgeCoachHistory,
} from "../src/forge/ForgeCoach";

function storage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("Forge coach history", () => {
  it("restores each player's history and clears it when a new local game starts", () => {
    vi.stubGlobal("localStorage", storage());
    const history: [
      { question: string; advice: string }[],
      { question: string; advice: string }[],
    ] = [
      [{ question: "Build?", advice: "Road" }],
      [{ question: "Trade?", advice: "Wait" }],
    ];
    writeForgeCoachHistory(null, history);
    expect(readForgeCoachHistory(null)).toEqual(history);
    clearLocalForgeCoachHistory();
    expect(readForgeCoachHistory(null)).toEqual([[], []]);
  });

  it("isolates online rooms and never falls back to the local game", () => {
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("sessionStorage", storage());
    const history: [
      { question: string; advice: string }[],
      { question: string; advice: string }[],
    ] = [[{ question: "Build?", advice: "Road" }], []];
    writeForgeCoachHistory("room-a", history);
    expect(readForgeCoachHistory("room-a")).toEqual(history);
    expect(readForgeCoachHistory("room-b")).toEqual([[], []]);
    expect(readForgeCoachHistory(null)).toEqual([[], []]);
    writeForgeCoachHistory("unavailable", history);
    expect(readForgeCoachHistory("unavailable")).toEqual([[], []]);
  });

  it("ignores broken or unavailable storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readForgeCoachHistory(null)).toEqual([[], []]);
    expect(() => writeForgeCoachHistory(null, [[], []])).not.toThrow();
    expect(() => clearLocalForgeCoachHistory()).not.toThrow();
  });
});
