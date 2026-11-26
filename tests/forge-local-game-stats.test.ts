import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bindLocalGame, flushLocalGames } from "../src/forge/localGameStats";
import { loadLocalGameCounts } from "../src/forge/ForgeLocalGameStats";

class MemoryStorage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}
const match = "bc5f8bb0-76dc-4af5-aee2-a5c0cbe6af99";
const makeClient = (
  id: string,
  rpc = vi.fn().mockResolvedValue({ data: true, error: null }),
) =>
  ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id } } },
        error: null,
      }),
    },
    rpc,
  }) as unknown as SupabaseClient;

describe("personal local game statistics", () => {
  it("records once after completion and does not count reopening", async () => {
    const storage = new MemoryStorage();
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const client = makeClient("account-a", rpc);
    bindLocalGame(storage, match, "account-a", "bot", false);
    expect(await flushLocalGames(storage, "account-a", client)).toBe(false);
    bindLocalGame(storage, match, "account-a", "bot", true);
    expect(await flushLocalGames(storage, "account-a", client)).toBe(true);
    bindLocalGame(storage, match, "account-a", "bot", true);
    expect(await flushLocalGames(storage, "account-a", client)).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("forge_record_local_game", {
      expected_player: "account-a",
      match,
      game_mode: "bot",
    });
  });

  it("does not transfer a game after account changes, including guest sign-in", async () => {
    const storage = new MemoryStorage();
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    bindLocalGame(storage, match, "account-a", "hotseat", false);
    bindLocalGame(storage, match, "account-b", "hotseat", true);
    expect(
      await flushLocalGames(storage, "account-b", makeClient("account-b", rpc)),
    ).toBe(false);
    expect(
      await flushLocalGames(storage, "account-a", makeClient("account-a", rpc)),
    ).toBe(true);
    expect(rpc).toHaveBeenCalledWith("forge_record_local_game", {
      expected_player: "account-a",
      match,
      game_mode: "hotseat",
    });
    const guestStorage = new MemoryStorage();
    bindLocalGame(guestStorage, match, null, "bot", false);
    bindLocalGame(guestStorage, match, "account-b", "bot", true);
    expect(
      await flushLocalGames(
        guestStorage,
        "account-b",
        makeClient("account-b", rpc),
      ),
    ).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("retains failed reports for retry and refuses a mismatched session", async () => {
    const storage = new MemoryStorage();
    bindLocalGame(storage, match, "account-a", "bot", true);
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: new Error("offline") })
      .mockResolvedValue({ data: true, error: null });
    expect(
      await flushLocalGames(storage, "account-a", makeClient("account-b", rpc)),
    ).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(
      await flushLocalGames(storage, "account-a", makeClient("account-a", rpc)),
    ).toBe(false);
    expect(
      await flushLocalGames(storage, "account-a", makeClient("account-a", rpc)),
    ).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("validates private counts returned by the database", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ bot_games: 3, hotseat_games: 2 }],
      error: null,
    });
    await expect(
      loadLocalGameCounts(makeClient("account-a", rpc)),
    ).resolves.toEqual({ bot_games: 3, hotseat_games: 2 });
    rpc.mockResolvedValueOnce({
      data: [{ bot_games: -1, hotseat_games: 0 }],
      error: null,
    });
    await expect(
      loadLocalGameCounts(makeClient("account-a", rpc)),
    ).rejects.toThrow();
  });
});
