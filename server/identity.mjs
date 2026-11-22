import { createClient } from "@supabase/supabase-js";
import { clearTimeout, setTimeout } from "node:timers";
import { URL } from "node:url";
import { createHash } from "node:crypto";
import { nicknameFromSeed } from "../src/forge/nickname.ts";

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function safeName(value) {
  if (typeof value !== "string" || value.length > 256) return null;
  const name = value.normalize("NFKC").trim();
  return /^[\p{L}\p{M}\p{N}_ -]{2,24}$/u.test(name) &&
    /[\p{L}\p{N}]/u.test(name)
    ? name
    : null;
}

/** Credentials may use plain HTTP only for a local development service. */
export function isValidIdentityEndpoint(value) {
  if (typeof value !== "string") return false;
  try {
    const endpoint = new URL(value);
    if (endpoint.username || endpoint.password) return false;
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      endpoint.hostname,
    );
    return (
      endpoint.protocol === "https:" ||
      (endpoint.protocol === "http:" && loopback)
    );
  } catch {
    return false;
  }
}

/** Verify with Supabase Auth, never with an unverified local JWT decode. */
export function createIdentityVerifier({
  client,
  url,
  publishableKey,
  timeoutMs = 5000,
} = {}) {
  const timeout =
    Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000
      ? timeoutMs
      : 5000;
  let authClient = client;
  if (
    !authClient &&
    isValidIdentityEndpoint(url) &&
    typeof publishableKey === "string" &&
    publishableKey
  ) {
    try {
      authClient = createClient(url, publishableKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: (input, init) => {
            const deadline = globalThis.AbortSignal.timeout(timeout);
            const signal = init?.signal
              ? globalThis.AbortSignal.any([init.signal, deadline])
              : deadline;
            return globalThis.fetch(input, { ...init, signal });
          },
        },
      });
    } catch {
      authClient = null;
    }
  }
  return async (token) => {
    if (
      !authClient?.auth ||
      typeof authClient.auth.getUser !== "function" ||
      typeof token !== "string" ||
      !token ||
      token.length > 8192 ||
      token.trim() !== token
    )
      return null;
    let timer;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => authClient.auth.getUser(token)),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(null), timeout);
        }),
      ]);
      const user = result?.data?.user;
      if (
        result?.error ||
        !user ||
        typeof user.id !== "string" ||
        !uuid.test(user.id)
      )
        return null;
      return {
        id: user.id,
        displayName:
          safeName(user.user_metadata?.display_name) ??
          nicknameFromSeed(
            createHash("sha256").update(user.id).digest().readUInt32BE(),
          ),
      };
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
