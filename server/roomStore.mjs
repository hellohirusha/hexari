/* global structuredClone */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { URL } from "node:url";

export const tokenHash = (token) =>
  createHash("sha256").update(token).digest("hex");

/** Service credentials remain in the game process; the browser cannot read room state. */
export function createRoomStore(url, secret, options = {}) {
  if (!url && !secret) return null;
  if (!url || !secret)
    throw new Error("Set both SUPABASE_URL and SUPABASE_SECRET_KEY.");
  let target;
  try {
    target = new URL(url);
  } catch {
    throw new Error("SUPABASE_URL is invalid.");
  }
  if (
    target.username ||
    target.password ||
    (target.protocol !== "https:" &&
      !(
        target.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
      ))
  )
    throw new Error("SUPABASE_URL must use HTTPS except for localhost.");
  const timeoutMs =
    Number.isSafeInteger(options.timeoutMs) &&
    options.timeoutMs >= 100 &&
    options.timeoutMs <= 30000
      ? options.timeoutMs
      : 10000;
  const database = createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => {
        const timeout = globalThis.AbortSignal.timeout(timeoutMs);
        const signal = init?.signal
          ? globalThis.AbortSignal.any([init.signal, timeout])
          : timeout;
        return globalThis.fetch(input, { ...init, signal });
      },
    },
  });
  return roomStore(database);
}

export function roomStore(database) {
  return {
    async ready() {
      const { error } = await database
        .from("forge_rooms")
        .select("id")
        .limit(1);
      if (error) throw new Error("Room storage failed.");
    },
    async save(snapshot) {
      const { error } = await database.from("forge_rooms").upsert(snapshot);
      if (error) throw new Error("Room storage failed.");
    },
    async load(id) {
      const { data, error } = await database
        .from("forge_rooms")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("Room storage failed.");
      return data;
    },
    async findByUser(userId, now) {
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          userId,
        )
      )
        return null;
      const { data, error } = await database
        .from("forge_rooms")
        .select("*")
        .eq("started", true)
        .eq("finished", false)
        .eq("closed", false)
        .gt("expires_at", now)
        .or(`player_one.eq.${userId},player_two.eq.${userId}`)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error("Room storage failed.");
      return data;
    },
    async purgeExpired(now) {
      const { error } = await database
        .from("forge_rooms")
        .delete()
        .lt("expires_at", now);
      if (error) throw new Error("Room storage failed.");
    },
    async remove(id) {
      const { error } = await database
        .from("forge_rooms")
        .delete()
        .eq("id", id);
      if (error) throw new Error("Room storage failed.");
    },
    async close(id) {
      const { error } = await database
        .from("forge_rooms")
        .update({ closed: true })
        .eq("id", id);
      if (error) throw new Error("Room storage failed.");
    },
    async report(report) {
      const { error } = await database
        .from("forge_chat_reports")
        .upsert(report, { onConflict: "room_id,message_id,reporter_seat" });
      if (error) throw new Error("Report storage failed.");
    },
    async reports() {
      const { data, error } = await database
        .from("forge_chat_reports")
        .select("*")
        .order("reported_at", { ascending: false })
        .limit(500);
      if (error) throw new Error("Report storage failed.");
      return data;
    },
    async reviewReport(room, message, reporter, reviewedAt) {
      const { data, error } = await database
        .from("forge_chat_reports")
        .update({ reviewed_at: reviewedAt })
        .eq("room_id", room)
        .eq("message_id", message)
        .eq("reporter_seat", reporter)
        .select("room_id");
      if (error) throw new Error("Report storage failed.");
      return data.length > 0;
    },
  };
}

export function roomSnapshot(room, now) {
  return {
    id: room.id,
    session: structuredClone(room.session),
    token_hashes: [...room.tokenHashes],
    chat: structuredClone(room.chat),
    created_at: room.created,
    updated_at: now,
    expires_at: room.created + 7200000,
    started: room.started,
    finished: room.session.game.phase === "end",
    closed: false,
    player_one: room.users?.[0]?.id ?? null,
    player_two: room.users?.[1]?.id ?? null,
  };
}
