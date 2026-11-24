import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountRedirect,
  consumeConfirmedSignup,
  loadAccountClient,
  refreshAfterSignupConfirmation,
  rememberPendingSignup,
  secureAccountURL,
  validPlayerName,
} from "../src/forge/account";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Forge accounts", () => {
  it("refreshes only the original tab once the matching signup is confirmed", () => {
    const data = new Map<string, string>();
    const tabStorage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    };
    const confirmed = {
      user: { email: "player@example.com", email_confirmed_at: "2026-01-01" },
    };
    rememberPendingSignup(" Player@example.com ", tabStorage);
    expect(
      consumeConfirmedSignup("TOKEN_REFRESHED", confirmed, tabStorage),
    ).toBe(false);
    expect(
      consumeConfirmedSignup(
        "SIGNED_IN",
        {
          user: {
            email: "other@example.com",
            email_confirmed_at: "2026-01-01",
          },
        },
        tabStorage,
      ),
    ).toBe(false);
    expect(
      consumeConfirmedSignup(
        "SIGNED_IN",
        { user: { email: "player@example.com", email_confirmed_at: null } },
        tabStorage,
      ),
    ).toBe(false);
    expect(consumeConfirmedSignup("SIGNED_IN", confirmed, tabStorage)).toBe(
      true,
    );
    expect(consumeConfirmedSignup("SIGNED_IN", confirmed, tabStorage)).toBe(
      false,
    );
  });
  it("does not reload the confirmation tab or a tab with no pending signup", () => {
    const data = new Map<string, string>();
    const tabStorage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    };
    const confirmed = {
      user: { email: "player@example.com", email_confirmed_at: "2026-01-01" },
    };
    expect(consumeConfirmedSignup("SIGNED_IN", confirmed, tabStorage)).toBe(
      false,
    );
    rememberPendingSignup("player@example.com", tabStorage);
    expect(
      consumeConfirmedSignup("SIGNED_IN", confirmed, tabStorage, true),
    ).toBe(false);
    expect(consumeConfirmedSignup("SIGNED_IN", confirmed, tabStorage)).toBe(
      false,
    );
  });
  it("refreshes the signup tab only once when confirmation arrives from another tab", () => {
    vi.useFakeTimers();
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const reload = vi.fn();
    vi.stubGlobal("window", {
      location: { search: "", reload },
      sessionStorage: storage,
      setTimeout,
    });
    const session = {
      user: { email: "player@example.com", email_confirmed_at: "2026-01-01" },
    };
    rememberPendingSignup("player@example.com", storage);
    refreshAfterSignupConfirmation("SIGNED_IN", session);
    refreshAfterSignupConfirmation("SIGNED_IN", session);
    expect(reload).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("does not refresh or consume pending signup during password recovery", () => {
    vi.useFakeTimers();
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const reload = vi.fn();
    vi.stubGlobal("window", {
      location: { search: "?account=recovery", reload },
      sessionStorage: storage,
      setTimeout,
    });
    const session = {
      user: { email: "player@example.com", email_confirmed_at: "2026-01-01" },
    };
    rememberPendingSignup("player@example.com", storage);
    refreshAfterSignupConfirmation("SIGNED_IN", session);
    vi.runAllTimers();
    expect(reload).not.toHaveBeenCalled();
    expect(consumeConfirmedSignup("SIGNED_IN", session, storage)).toBe(true);
  });
  it("does not reload a tab with an active game, even if one starts before the scheduled refresh", () => {
    vi.useFakeTimers();
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const reload = vi.fn();
    vi.stubGlobal("window", {
      location: { search: "", reload },
      sessionStorage: storage,
      setTimeout,
    });
    const session = {
      user: { email: "player@example.com", email_confirmed_at: "2026-01-01" },
    };
    let active = true;
    rememberPendingSignup("player@example.com", storage);
    refreshAfterSignupConfirmation("SIGNED_IN", session, () => !active);
    vi.runAllTimers();
    expect(reload).not.toHaveBeenCalled();
    active = false;
    rememberPendingSignup("player@example.com", storage);
    refreshAfterSignupConfirmation("SIGNED_IN", session, () => !active);
    active = true;
    vi.runAllTimers();
    expect(reload).not.toHaveBeenCalled();
  });
  it("stays unavailable when Supabase is not configured", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    await expect(loadAccountClient()).resolves.toBeNull();
  });
  it("does not send account credentials to a local server from a production page", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    vi.stubGlobal("window", { location: { origin: "https://forge.example" } });
    await expect(loadAccountClient()).rejects.toThrow();
  });
  it("validates player names without excluding non-English names", () => {
    expect(validPlayerName("Knight 7")).toBe(true);
    expect(validPlayerName("සමන්")).toBe(true);
    expect(validPlayerName("A")).toBe(false);
    expect(validPlayerName("<script>")).toBe(false);
    expect(validPlayerName("--")).toBe(false);
    expect(validPlayerName("Ａ４")).toBe(true);
    expect(validPlayerName("x".repeat(25))).toBe(false);
  });
  it("creates recovery links on the same app origin and rejects external redirects", () => {
    expect(accountRedirect("https://example.test", "/forge", "recovery")).toBe(
      "https://example.test/forge?account=recovery",
    );
    expect(accountRedirect("https://example.test", "/", "confirm")).toBe(
      "https://example.test/?account=confirm",
    );
    expect(() =>
      accountRedirect(
        "https://example.test",
        "//elsewhere.test/reset",
        "recovery",
      ),
    ).toThrow();
  });
  it("allows HTTPS and local development but rejects insecure remote servers", () => {
    expect(secureAccountURL("https://example.supabase.co")).toBe(true);
    expect(secureAccountURL("http://localhost:54321")).toBe(true);
    expect(secureAccountURL("http://127.0.0.1:54321")).toBe(true);
    expect(secureAccountURL("http://[::1]:54321")).toBe(true);
    expect(secureAccountURL("http://localhost.example.com")).toBe(false);
    expect(secureAccountURL("http://example.com")).toBe(false);
    expect(secureAccountURL("https://user:secret@example.com")).toBe(false);
  });
});
