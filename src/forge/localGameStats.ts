import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAccountClient } from "./account";
import type { Game } from "./engine";

type LocalMode = "bot" | "hotseat";
type Binding = {
  owner: string | null;
  mode: LocalMode;
  pending: boolean;
  sent: boolean;
};
type StatsStorage = Pick<Storage, "getItem" | "setItem" | "key" | "length">;
const prefix = "forge-local-game-v1:";
const matchPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readBinding(storage: StatsStorage, match: string): Binding | null {
  try {
    const value: unknown = JSON.parse(
      storage.getItem(prefix + match) ?? "null",
    );
    if (!value || typeof value !== "object") return null;
    const data = value as Partial<Binding>;
    if (
      !(typeof data.owner === "string" || data.owner === null) ||
      (data.mode !== "bot" && data.mode !== "hotseat") ||
      typeof data.pending !== "boolean" ||
      typeof data.sent !== "boolean"
    )
      return null;
    return data as Binding;
  } catch {
    return null;
  }
}

/** Bind a game to the account present at its start, including a guest marker. */
export function bindLocalGame(
  storage: StatsStorage,
  match: string,
  owner: string | null,
  mode: LocalMode,
  finished: boolean,
): void {
  if (!matchPattern.test(match)) return;
  try {
    const key = prefix + match;
    const existing = readBinding(storage, match);
    // A corrupt binding must not be rebound to another account.
    if (!existing && storage.getItem(key) !== null) return;
    if (existing && existing.mode !== mode) return;
    const next = existing ?? { owner, mode, pending: false, sent: false };
    if (finished && next.owner && !next.sent) next.pending = true;
    storage.setItem(key, JSON.stringify(next));
  } catch {
    // Fail closed if storage is unavailable; never attribute a game by guessing.
  }
}

/** Retry queued reports only while the account that owns them is signed in. */
export async function flushLocalGames(
  storage: StatsStorage,
  owner: string,
  client: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await client.auth.getSession();
  if (error || data.session?.user.id !== owner) return false;
  let sent = false;
  const matches: string[] = [];
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) matches.push(key.slice(prefix.length));
    }
  } catch {
    return false;
  }
  for (const match of matches) {
    const binding = readBinding(storage, match);
    if (
      !matchPattern.test(match) ||
      !binding ||
      binding.owner !== owner ||
      !binding.pending ||
      binding.sent
    )
      continue;
    const result = await client.rpc("forge_record_local_game", {
      expected_player: owner,
      match,
      game_mode: binding.mode,
    });
    if (result.error || result.data !== true) continue;
    try {
      // Preserve the owner binding so a reopened game cannot change accounts.
      storage.setItem(
        prefix + match,
        JSON.stringify({ ...binding, pending: false, sent: true }),
      );
      sent = true;
    } catch {
      // The server deduplicates a later retry if the local acknowledgement fails.
    }
  }
  return sent;
}

export function useLocalGameStats(
  game: Game,
  started: boolean,
  opponent: "bot" | "hotseat" | "online",
  accountId: string | null,
): void {
  useEffect(() => {
    if (started && opponent !== "online" && game.matchId) {
      try {
        bindLocalGame(
          window.localStorage,
          game.matchId,
          accountId,
          opponent,
          game.phase === "end",
        );
      } catch {
        // Storage access itself can be denied by the browser.
      }
    }
    if (!accountId) return;
    let active = true;
    const send = async () => {
      try {
        const client = await loadAccountClient();
        if (!active || !client) return;
        if (await flushLocalGames(window.localStorage, accountId, client))
          window.dispatchEvent(new Event("forge:local-game-recorded"));
      } catch {
        // The next retry or sign-in will send any pending local game.
      }
    };
    void send();
    const retry = window.setInterval(() => void send(), 30000);
    return () => {
      active = false;
      window.clearInterval(retry);
    };
  }, [accountId, game.matchId, game.phase, opponent, started]);
}
