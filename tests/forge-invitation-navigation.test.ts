import { describe, expect, it } from "vitest";
import { returningToAnalyzer } from "../src/hexari/forgeInvitationNavigation";

describe("Forge invitation navigation", () => {
  it("keeps the invitation for direct visits and unrelated referrers", () => {
    expect(returningToAnalyzer("https://hexari.hirusha.space/", "")).toBe(
      false,
    );
    expect(
      returningToAnalyzer(
        "https://hexari.hirusha.space/",
        "https://example.com/tools",
      ),
    ).toBe(false);
    expect(
      returningToAnalyzer("https://hexari.hirusha.space/?from=other", ""),
    ).toBe(false);
  });

  it("recognizes tools and Forge return links even without a referrer", () => {
    expect(
      returningToAnalyzer("https://hexari.hirusha.space/?from=tools", ""),
    ).toBe(true);
    expect(
      returningToAnalyzer("https://hexari.hirusha.space/?from=forge", ""),
    ).toBe(true);
  });

  it("recognizes navigation from tools and Forge", () => {
    expect(
      returningToAnalyzer(
        "http://localhost:5173/",
        "http://localhost:5173/tools",
      ),
    ).toBe(true);
    expect(
      returningToAnalyzer(
        "http://localhost:5173/",
        "http://localhost:5173/forge",
      ),
    ).toBe(true);
    expect(
      returningToAnalyzer(
        "https://hexari.hirusha.space/",
        "https://forge.hirusha.space/",
      ),
    ).toBe(true);
  });
});
