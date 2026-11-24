import type { SupabaseClient } from "@supabase/supabase-js";

let clientPromise: Promise<SupabaseClient | null> | undefined;

const pendingSignupKey = "forge-pending-signup-v1";
type PendingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type ConfirmedSession = {
  user: { email?: string; email_confirmed_at?: string | null };
} | null;

/** The pending marker is tab-local and contains no password or access token. */
export function rememberPendingSignup(email: string, storage: PendingStorage) {
  try {
    storage.setItem(pendingSignupKey, email.trim().toLowerCase());
  } catch {
    // The account still works when browser storage is unavailable.
  }
}

export function consumeConfirmedSignup(
  event: string,
  session: ConfirmedSession,
  storage: PendingStorage,
  alreadyOnConfirmationPage = false,
): boolean {
  if (event !== "SIGNED_IN" || !session?.user.email_confirmed_at) return false;
  try {
    const pending = storage.getItem(pendingSignupKey);
    if (!pending || pending !== session.user.email?.trim().toLowerCase())
      return false;
    storage.removeItem(pendingSignupKey);
    return !alreadyOnConfirmationPage;
  } catch {
    return false;
  }
}

/** Supabase emits SIGNED_IN across same-origin tabs once it has stored the session. */
export function refreshAfterSignupConfirmation(
  event: string,
  session: ConfirmedSession,
  canReload: () => boolean = () => true,
) {
  try {
    const purpose = new URLSearchParams(window.location.search).get("account");
    if (purpose === "recovery") return;
    if (
      consumeConfirmedSignup(
        event,
        session,
        window.sessionStorage,
        purpose === "confirm",
      )
    ) {
      // Keep an active game running. Check again when the scheduled refresh
      // executes in case the player started one since the auth event.
      if (canReload())
        window.setTimeout(() => {
          if (canReload()) window.location.reload();
        }, 0);
    }
  } catch {
    // Storage can be disabled; the auth listener still updates the account UI.
  }
}

function localAccountHost(value: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(value).hostname,
    );
  } catch {
    return false;
  }
}

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
    (typeof window !== "undefined" &&
      !secureAccountURL(window.location.origin)) ||
    (localAccountHost(url) &&
      (typeof window === "undefined" ||
        !localAccountHost(window.location.origin)))
  ) {
    return Promise.reject(
      new Error("The account connection is not allowed from this page."),
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
