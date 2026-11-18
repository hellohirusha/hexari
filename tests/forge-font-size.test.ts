import { describe, expect, it } from "vitest";
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZE_KEY,
  readFontSize,
} from "../src/forge/fontSize";

describe("Forge text size", () => {
  it("uses 103% for a fresh or previously unversioned preference", () => {
    expect(DEFAULT_FONT_SIZE).toBe(103);
    expect(FONT_SIZE_KEY).toBe("forge-font-size-v3");
    expect(readFontSize(null)).toBe(103);
  });
  it("restores valid explicit choices and ignores invalid values", () => {
    expect(readFontSize("120")).toBe(120);
    for (const value of ["99", "141", "103.5", "", "bad"])
      expect(readFontSize(value)).toBe(103);
  });
});
