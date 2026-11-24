import { useEffect, useState, type FormEvent } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  accountRedirect,
  loadAccountClient,
  refreshAfterSignupConfirmation,
  rememberPendingSignup,
  validPlayerName,
} from "./account";

type Mode = "signin" | "register" | "forgot";

function clearAccountPurpose(purpose: "confirm" | "recovery") {
  const url = new URL(window.location.href);
  if (url.searchParams.get("account") !== purpose) return;
  url.searchParams.delete("account");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export default function ForgeAccount({
  canReloadAfterConfirmation = () => true,
}: {
  canReloadAfterConfirmation?: () => boolean;
}) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>("signin");
  const [recovering, setRecovering] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("account") === "recovery",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    let authVersion = 0;
    void loadAccountClient()
      .then(async (instance) => {
        if (!active) return;
        setClient(instance);
        if (instance) {
          const { data } = instance.auth.onAuthStateChange((event, next) => {
            if (!active) return;
            authVersion++;
            setSession(next);
            if (event === "PASSWORD_RECOVERY") setRecovering(true);
            if (event === "SIGNED_OUT") setRecovering(false);
            if (next && (event === "SIGNED_IN" || event === "INITIAL_SESSION"))
              clearAccountPurpose("confirm");
          });
          unsubscribe = () => data.subscription.unsubscribe();
          const version = authVersion;
          const result = await instance.auth.getSession();
          if (!active) return;
          if (result.error)
            setMessage("Could not load your account. Try reopening settings.");
          if (version === authVersion) setSession(result.data.session);
        }
        if (active) setLoading(false);
      })
      .catch(() => {
        if (active) {
          setMessage("Account service could not be initialized.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  function changeMode(next: Mode) {
    setMode(next);
    setPassword("");
    setMessage("");
  }

  function finishRecovery() {
    setPassword("");
    setRecovering(false);
    clearAccountPurpose("recovery");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!client || busy) return;
    if (mode === "register" && !validPlayerName(name)) {
      setMessage(
        "Choose a name with 2 to 24 letters, numbers, spaces, underscores or hyphens.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (mode === "forgot") {
        const redirectTo = accountRedirect(
          window.location.origin,
          window.location.pathname,
          "recovery",
        );
        const { error } = await client.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo },
        );
        setMessage(
          error
            ? error.message
            : "If an account exists, a reset link will be sent to that email.",
        );
      } else {
        const result =
          mode === "signin"
            ? await client.auth.signInWithPassword({
                email: email.trim(),
                password,
              })
            : await client.auth.signUp({
                email: email.trim(),
                password,
                options: {
                  data: { display_name: name.trim() },
                  emailRedirectTo: accountRedirect(
                    window.location.origin,
                    window.location.pathname,
                    "confirm",
                  ),
                },
              });
        if (result.error) setMessage(result.error.message);
        else {
          setPassword("");
          if (mode === "register" && !result.data.session) {
            try {
              rememberPendingSignup(email, window.sessionStorage);
              // The email may have been confirmed before signUp resolved.
              const current = await client.auth.getSession();
              if (!current.error)
                refreshAfterSignupConfirmation(
                  "SIGNED_IN",
                  current.data.session,
                  canReloadAfterConfirmation,
                );
            } catch {
              // Confirmation can still update the account through auth events.
            }
          }
          setMessage(
            result.data.session
              ? "Signed in."
              : "Check your email to confirm your account.",
          );
        }
      }
    } catch {
      setMessage("Could not reach the account service. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) setMessage(error.message);
      else {
        finishRecovery();
        setMessage("Password updated.");
      }
    } catch {
      setMessage("Could not update your password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (!client || busy) return;
    const nextName = String(
      new FormData(event.currentTarget as HTMLFormElement).get(
        "display_name",
      ) ?? "",
    );
    if (!validPlayerName(nextName)) {
      setMessage(
        "Choose a name with 2 to 24 letters, numbers, spaces, underscores or hyphens.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await client.auth.updateUser({
        data: { display_name: nextName.trim() },
      });
      setMessage(error ? error.message : "Player name updated.");
    } catch {
      setMessage("Could not update your name. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p role="status">Loading account...</p>;
  if (!client)
    return <p role="status">{message || "Accounts are not configured yet."}</p>;
  if (recovering && session)
    return (
      <form className="forge-account-form" onSubmit={updatePassword}>
        <p>Choose a new password.</p>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? "Please wait..." : "Update password"}
        </button>
        <button
          className="button ghost"
          type="button"
          disabled={busy}
          onClick={() => {
            setMessage("");
            finishRecovery();
          }}
        >
          Cancel
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    );
  if (session)
    return (
      <div className="forge-account-form">
        <p>Signed in as {session.user.email}</p>
        <form className="forge-account-form" onSubmit={saveName}>
          <label>
            Player name
            <input
              name="display_name"
              autoComplete="nickname"
              defaultValue={String(
                session.user.user_metadata.display_name || "",
              )}
              maxLength={24}
              required
            />
          </label>
          <button className="button ghost" type="submit" disabled={busy}>
            Save name
          </button>
        </form>
        <button
          className="button ghost"
          type="button"
          disabled={busy}
          onClick={() => {
            setPassword("");
            setMessage("");
            setRecovering(true);
          }}
        >
          Change password
        </button>
        <button
          className="button ghost"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const { error } = await client.auth.signOut({ scope: "local" });
              setMessage(error ? error.message : "Signed out.");
            } catch {
              setMessage("Could not sign out. Try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Sign out
        </button>
        {message && <p role="status">{message}</p>}
      </div>
    );
  return (
    <form className="forge-account-form" onSubmit={submit}>
      {recovering && (
        <p role="status">Sign in to finish resetting your password.</p>
      )}
      {mode !== "forgot" && (
        <div
          className="forge-account-modes"
          role="group"
          aria-label="Account action"
        >
          <button
            type="button"
            className={`button ${mode === "signin" ? "primary" : "ghost"}`}
            aria-pressed={mode === "signin"}
            disabled={busy}
            onClick={() => changeMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`button ${mode === "register" ? "primary" : "ghost"}`}
            aria-pressed={mode === "register"}
            disabled={busy}
            onClick={() => changeMode("register")}
          >
            Create account
          </button>
        </div>
      )}
      {mode === "forgot" && <p>Enter your email for a password reset link.</p>}
      {mode === "register" && (
        <label>
          Player name
          <input
            autoComplete="nickname"
            value={name}
            maxLength={24}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      )}
      <label>
        Email
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      {mode !== "forgot" && (
        <label>
          Password
          <input
            type="password"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            minLength={mode === "register" ? 8 : undefined}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
      )}
      <button
        type="submit"
        className="button primary forge-account-submit"
        disabled={busy}
      >
        {busy
          ? "Please wait..."
          : mode === "signin"
            ? "Sign in"
            : mode === "register"
              ? "Create account"
              : "Send reset link"}
      </button>
      {mode !== "register" && (
        <button
          type="button"
          className="button ghost forge-account-secondary"
          disabled={busy}
          onClick={() => changeMode(mode === "forgot" ? "signin" : "forgot")}
        >
          {mode === "forgot" ? "Back to sign in" : "Forgot password?"}
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
