import { describe, expect, it } from "vitest";
import { defaultBoard } from "../src/shared/board";
import { matchingRollTiles } from "../src/forge/rollHighlight";

describe("Forge roll highlights", () => {
  it("finds every matching hex and none for seven", () => {
    const eights = matchingRollTiles(defaultBoard, 8);
    expect(eights).toHaveLength(2);
    expect(eights.every((index) => defaultBoard[index].number === 8)).toBe(
      true,
    );
    expect(matchingRollTiles(defaultBoard, 2)).toHaveLength(1);
    expect(matchingRollTiles(defaultBoard, 7)).toEqual([]);
  });
});
