import { describe, expect, it } from "vitest";
import config from "../vercel.json";
import { resolveSiteRoute } from "../src/shared/siteRouting";

function route(url: string) {
  return resolveSiteRoute(new URL(url));
}

describe("site routing", () => {
  it("opens Forge at the root of its production domain", () => {
    expect(route("https://forge.hirusha.space/")).toEqual({ surface: "forge" });
  });

  it("keeps Hexari and the strategy tools on the existing domain", () => {
    expect(route("https://hexari.hirusha.space/")).toEqual({
      surface: "hexari",
    });
    expect(route("https://hexari.hirusha.space/tools")).toEqual({
      surface: "tools",
    });
  });

  it("keeps local and preview Forge routes usable", () => {
    expect(route("http://localhost:5173/forge")).toEqual({ surface: "forge" });
    expect(route("https://preview.vercel.app/forge/")).toEqual({
      surface: "forge",
    });
    expect(route("http://localhost:5173/forge-icon.svg")).toEqual({
      surface: "hexari",
    });
  });

  it("does not rewrite the retired production Forge path", () => {
    const forgeRewrite = config.rewrites.find(
      (item) => item.source === "/forge",
    );
    const hostCondition = forgeRewrite?.missing?.find(
      (item) => item.type === "host",
    );

    expect(forgeRewrite?.destination).toBe("/");
    expect(hostCondition).toBeDefined();
    const excludedHost = new RegExp(`^(?:${hostCondition!.value})$`);
    expect(excludedHost.test("hexari.hirusha.space")).toBe(true);
    expect(excludedHost.test("preview.vercel.app")).toBe(false);
  });
});
