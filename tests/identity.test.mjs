import { afterEach, describe, expect, it, vi } from "vitest";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { nicknameFromSeed } from "../src/forge/nickname.ts";
import {
  createIdentityVerifier,
  isValidIdentityEndpoint,
} from "../server/identity.mjs";

const id = "b2dc96c9-35b2-4dbe-a058-5ea2444ca110";
const client = (getUser) => ({ auth: { getUser } });
afterEach(() => vi.unstubAllGlobals());

describe("server identity verification", () => {
  it("only permits HTTPS or HTTP on an exact loopback host", async () => {
    for (const url of [
      "https://project.supabase.co",
      "http://localhost:54321",
      "http://127.0.0.1:54321",
      "http://[::1]:54321",
    ])
      expect(isValidIdentityEndpoint(url)).toBe(true);
    for (const url of [
      "http://example.com",
      "http://localhost.example.com",
      "http://127.0.0.1.example.com",
      "https://user:password@example.com",
      "ftp://localhost",
      "not a url",
      "",
    ]) {
      expect(isValidIdentityEndpoint(url)).toBe(false);
      await expect(
        createIdentityVerifier({ url, publishableKey: "key" })("token"),
      ).resolves.toBeNull();
    }
  });
  it("asks Supabase Auth to validate the supplied token and returns only safe identity", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: {
          id,
          email: "private@example.com",
          user_metadata: { display_name: "Player 7", secret: "private" },
        },
      },
      error: null,
    });
    const verify = createIdentityVerifier({ client: client(getUser) });
    await expect(verify("valid-token")).resolves.toEqual({
      id,
      displayName: "Player 7",
    });
    expect(getUser).toHaveBeenCalledOnce();
    expect(getUser).toHaveBeenCalledWith("valid-token");
  });
  it("rejects empty, oversized and whitespace-wrapped tokens without calling the provider", async () => {
    const getUser = vi.fn();
    const verify = createIdentityVerifier({ client: client(getUser) });
    for (const token of [
      undefined,
      null,
      "",
      " token",
      "token ",
      "x".repeat(8193),
      1,
    ]) {
      await expect(verify(token)).resolves.toBeNull();
    }
    expect(getUser).not.toHaveBeenCalled();
  });
  it("fails closed when the provider rejects, returns an error, or returns a malformed identity", async () => {
    for (const response of [
      { data: { user: null }, error: null },
      { data: { user: { id } }, error: { message: "invalid" } },
      { data: { user: { id: "not-a-uuid" } }, error: null },
      null,
    ]) {
      const verify = createIdentityVerifier({
        client: client(vi.fn().mockResolvedValue(response)),
      });
      await expect(verify("untrusted")).resolves.toBeNull();
    }
    const unreachable = createIdentityVerifier({
      client: client(vi.fn().mockRejectedValue(new Error("offline"))),
    });
    await expect(unreachable("token")).resolves.toBeNull();
    await expect(createIdentityVerifier()("token")).resolves.toBeNull();
  });
  it("uses a stable generated nickname for unsafe metadata", async () => {
    for (const display_name of [
      "<script>",
      " ",
      "x".repeat(257),
      { nested: true },
      null,
    ]) {
      const verify = createIdentityVerifier({
        client: client(
          vi.fn().mockResolvedValue({
            data: { user: { id, user_metadata: { display_name } } },
            error: null,
          }),
        ),
      });
      await expect(verify("token")).resolves.toEqual({
        id,
        displayName: nicknameFromSeed(
          createHash("sha256").update(id).digest().readUInt32BE(),
        ),
      });
    }
    const verify = createIdentityVerifier({
      client: client(
        vi.fn().mockResolvedValue({
          data: { user: { id, user_metadata: { display_name: "සමන්" } } },
          error: null,
        }),
      ),
    });
    await expect(verify("token")).resolves.toEqual({ id, displayName: "සමන්" });
    const player = createIdentityVerifier({
      client: client(
        vi.fn().mockResolvedValue({
          data: { user: { id, user_metadata: { display_name: "Player" } } },
          error: null,
        }),
      ),
    });
    await expect(player("token")).resolves.toEqual({
      id,
      displayName: "Player",
    });
  });
  it("fails closed when authentication does not respond before the deadline", async () => {
    const verify = createIdentityVerifier({
      client: client(() => new Promise(() => {})),
      timeoutMs: 10,
    });
    await expect(verify("token")).resolves.toBeNull();
  });
  it("aborts a stalled network request after the deadline", async () => {
    let signal;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options) => {
        signal = options.signal;
        return new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          }),
        );
      }),
    );
    const verify = createIdentityVerifier({
      url: "https://example.com",
      publishableKey: "test-key",
      timeoutMs: 20,
    });
    await expect(verify("token")).resolves.toBeNull();
    await delay(30);
    expect(signal?.aborted).toBe(true);
  });
});
