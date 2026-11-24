import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readCoachHistory,
  writeCoachHistory,
} from "../src/hexari/coachHistory";

afterEach(() => vi.unstubAllGlobals());

describe("Hexari coach history", () => {
  it("keeps the workspace usable when browser storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("Storage denied");
      },
      setItem: () => {
        throw new Error("Storage denied");
      },
    });
    expect(readCoachHistory()).toEqual([]);
    expect(() => writeCoachHistory([])).not.toThrow();
  });

  it("keeps only valid, recent entries when loading saved history", () => {
    vi.stubGlobal("localStorage", {
      getItem: () =>
        JSON.stringify([
          { board: "board", question: "question", advice: "advice" },
          { board: "board", question: 2, advice: "invalid" },
        ]),
    });
    expect(readCoachHistory()).toEqual([
      { board: "board", question: "question", advice: "advice" },
    ]);
  });
});
