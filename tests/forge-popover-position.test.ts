import { describe, expect, it } from "vitest";
import { positionBuildPopover } from "../src/forge/popoverPosition";

describe("build popup placement", () => {
  const board = { width: 480, height: 370 };
  const popup = { width: 210, height: 160 };
  it("places the popup below a top-edge selection", () => {
    expect(positionBuildPopover(board, popup, { x: 240, y: 15 })).toEqual({
      left: 135,
      top: 23,
    });
  });
  it("keeps bottom and side selections inside the board", () => {
    expect(positionBuildPopover(board, popup, { x: 475, y: 360 })).toEqual({
      left: 266,
      top: 192,
    });
    expect(positionBuildPopover(board, popup, { x: 5, y: 200 })).toEqual({
      left: 4,
      top: 32,
    });
  });
});
