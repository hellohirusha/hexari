import { afterEach, describe, expect, it, vi } from "vitest";
import { nicknameFromSeed, isGeneratedNickname } from "../src/forge/nickname";
import { createForgeInviteUrl } from "../src/forge/online/invite";

afterEach(() => vi.unstubAllGlobals());
describe("Forge nicknames", () => {
  it("generates valid repeatable nicknames and rejects arbitrary input", () => {
    expect(nicknameFromSeed(2026)).toBe(nicknameFromSeed(2026));
    expect(isGeneratedNickname(nicknameFromSeed(2026))).toBe(true);
    expect(isGeneratedNickname("<script>#1234")).toBe(false);
    expect(isGeneratedNickname("MadeUp#1234")).toBe(false);
  });
  it("stores one guest nickname and gives the bot a different one", async () => {
    vi.resetModules();
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const names = await import("../src/forge/nickname");
    const human = names.getOrCreateNickname();
    const bot = names.getBotNickname();
    expect(human).not.toBe(bot);
    vi.resetModules();
    const reloaded = await import("../src/forge/nickname");
    expect(reloaded.getOrCreateNickname()).toBe(human);
    expect(reloaded.getBotNickname()).toBe(bot);
  });
  it("encodes the inviter name without including a session token", () => {
    const value = createForgeInviteUrl(
      "https://example.com/forge?code=private&account=confirm",
      "room123",
      "AmberFox#1234",
    );
    const url = new URL(value);
    const params = new URLSearchParams(url.hash.slice(1));
    expect(url.search).toBe("");
    expect(params.get("forge-room")).toBe("room123");
    expect(params.get("from")).toBe("AmberFox#1234");
    expect(params.has("token")).toBe(false);
  });
});
