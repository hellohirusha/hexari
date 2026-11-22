import { describe, expect, it, vi } from "vitest";
import { linkOnlineAccount } from "../src/forge/online/accountLink";

describe("online account linking", () => {
  it("sends the current account token to the active connection", async () => {
    const socket = { send: vi.fn() };
    const result = await linkOnlineAccount(
      "player-1",
      async () => ({ access_token: "token", user: { id: "player-1" } }),
      socket,
      () => true,
    );
    expect(result).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "linkAccount", accessToken: "token" }),
    );
  });

  it("does not link a different or signed-out account", async () => {
    const socket = { send: vi.fn() };
    expect(
      await linkOnlineAccount(
        "player-1",
        async () => null,
        socket,
        () => true,
      ),
    ).toBe(false);
    expect(
      await linkOnlineAccount(
        "player-1",
        async () => ({ access_token: "other-token", user: { id: "player-2" } }),
        socket,
        () => true,
      ),
    ).toBe(false);
    expect(socket.send).not.toHaveBeenCalled();
  });

  it("does not send a token after the connection becomes stale", async () => {
    let resolveSession!: (session: {
      access_token: string;
      user: { id: string };
    }) => void;
    const session = new Promise<{ access_token: string; user: { id: string } }>(
      (resolve) => {
        resolveSession = resolve;
      },
    );
    const socket = { send: vi.fn() };
    let current = true;
    const linking = linkOnlineAccount(
      "player-1",
      () => session,
      socket,
      () => current,
    );
    current = false;
    resolveSession({ access_token: "token", user: { id: "player-1" } });
    expect(await linking).toBe(false);
    expect(socket.send).not.toHaveBeenCalled();
  });
});
