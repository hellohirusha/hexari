import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountRedirect,
  loadAccountClient,
  secureAccountURL,
  validPlayerName,
} from "../src/forge/account";

afterEach(() => vi.unstubAllEnvs());
describe("Forge accounts", () => {
  it("stays unavailable when Supabase is not configured", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    await expect(loadAccountClient()).resolves.toBeNull();
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
