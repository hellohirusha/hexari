import { describe, expect, it } from "vitest";
import { forgeHref, hexariHomeHref } from "../src/shared/navigation";

describe("application navigation", () => {
  it("links production Hexari to Forge on its dedicated domain", () => {
    expect(forgeHref("hexari.hirusha.space")).toBe(
      "https://forge.hirusha.space/",
    );
  });

  it("links production Forge back to the Hexari domain", () => {
    expect(hexariHomeHref("forge.hirusha.space")).toBe(
      "https://hexari.hirusha.space/",
    );
  });

  it.each(["localhost", "127.0.0.1", "preview.example.com"])(
    "keeps navigation on the current host for %s",
    (hostname) => {
      expect(forgeHref(hostname)).toBe("/forge");
      expect(hexariHomeHref(hostname)).toBe("/");
    },
  );
});
