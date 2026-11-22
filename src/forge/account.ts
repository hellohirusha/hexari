import type { SupabaseClient } from "@supabase/supabase-js";

let clientPromise: Promise<SupabaseClient | null> | undefined;

export function secureAccountURL(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

/** Only the public project URL and publishable key belong in the browser. */
export function loadAccountClient(): Promise<SupabaseClient | null> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Promise.resolve(null);
  if (
    !secureAccountURL(url) ||
    (typeof window !== "undefined" && !secureAccountURL(window.location.origin))
  ) {
    return Promise.reject(
      new Error("Account connections require HTTPS outside localhost."),
    );
  }
  clientPromise ??= import("@supabase/supabase-js")
    .then(({ createClient }) => createClient(url, key))
    .catch((error: unknown) => {
      clientPromise = undefined;
      throw error;
    });
  return clientPromise;
}

export function validPlayerName(name: string): boolean {
  const normalized = name.normalize("NFKC").trim();
  return (
    /^[\p{L}\p{M}\p{N}_ -]{2,24}$/u.test(normalized) &&
    /[\p{L}\p{N}]/u.test(normalized)
  );
}

/** Redirect only to the current application origin, never to user-supplied URLs. */
export function accountRedirect(
  origin: string,
  pathname: string,
  purpose: "confirm" | "recovery",
) {
  const target = new URL(pathname, origin);
  if (target.origin !== origin) throw new Error("Invalid account redirect.");
  target.searchParams.set("account", purpose);
  return target.toString();
}
