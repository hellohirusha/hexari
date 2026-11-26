import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import ForgeStandings, {
  loadStandings,
  parseStandings,
} from "../src/forge/ForgeStandings";

const own = {
  rank: 2,
  player_name: "Player",
  games_played: 3,
  wins: 1,
  is_self: true,
};
const leader = {
  rank: 1,
  player_name: "Winner",
  games_played: 4,
  wins: 3,
  is_self: false,
};

describe("Forge online standings", () => {
  it("fetches the authenticated standings without exposing account details", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [leader, own], error: null });
    const client = { rpc } as unknown as SupabaseClient;
    await expect(loadStandings(client)).resolves.toEqual([leader, own]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("forge_account_standings");
  });

  it("shows an unranked player with no completed games", () => {
    expect(
      parseStandings([{ ...own, rank: null, games_played: 0, wins: 0 }]),
    ).toEqual([{ ...own, rank: null, games_played: 0, wins: 0 }]);
  });

  it("rejects malformed or mismatched standings", () => {
    expect(() => parseStandings([leader])).toThrow();
    expect(() => parseStandings([own, own])).toThrow();
    expect(() => parseStandings([{ ...own, wins: 4 }])).toThrow();
    expect(() => parseStandings({})).toThrow();
  });

  it("propagates service errors and renders an accessible loading state", async () => {
    const error = new Error("unavailable");
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error }),
    } as unknown as SupabaseClient;
    await expect(loadStandings(client)).rejects.toThrow("unavailable");
    const html = renderToStaticMarkup(
      <ForgeStandings client={client} userId="user" />,
    );
    expect(html).toContain("Online standings");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("email");
  });
});
