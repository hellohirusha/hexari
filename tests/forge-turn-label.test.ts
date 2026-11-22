import { describe, expect, it } from "vitest";
import { turnLabel } from "../src/forge/turnLabel";

describe("Forge turn labels", () => {
  it("identifies either online seat from the viewer's perspective", () => {
    expect(turnLabel("online", 0, 0, false)).toBe("You");
    expect(turnLabel("online", 0, 1, false)).toBe("Opponent");
    expect(turnLabel("online", 1, 1, false)).toBe("You");
    expect(turnLabel("online", 1, 0, false)).toBe("Opponent");
  });
  it("distinguishes bot and local player turns", () => {
    expect(turnLabel("bot", 0, 0, false)).toBe("You");
    expect(turnLabel("bot", 0, 1, false)).toBe("Bot");
    expect(turnLabel("hotseat", 0, 0, false)).toBe("Player 1");
    expect(turnLabel("hotseat", 1, 1, false)).toBe("Player 2");
  });
  it("shows the winner accurately when the board is viewed after a game", () => {
    expect(turnLabel("online", 1, 1, true)).toBe("You win!");
    expect(turnLabel("online", 1, 0, true)).toBe("Opponent wins!");
    expect(turnLabel("bot", 0, 1, true)).toBe("Bot wins!");
    expect(turnLabel("hotseat", 1, 0, true)).toBe("Player 1 wins!");
  });
});
