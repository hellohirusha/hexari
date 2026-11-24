import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectLobbyWithRetry,
  reconnectOnlineGame,
} from "../src/forge/online/lobbyConnection";

class FakeSocket {
  static sockets: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  messages: string[] = [];

  constructor(public url: string) {
    FakeSocket.sockets.push(this);
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }
  send(message: string) {
    this.messages.push(message);
  }
}

describe("Forge lobby connection", () => {
  beforeEach(() => {
    FakeSocket.sockets = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function start() {
    const onOpen = vi.fn();
    const onRetry = vi.fn();
    const onFailure = vi.fn();
    const cancel = connectLobbyWithRetry({
      address: "wss://example.com/forge",
      onOpen,
      onRetry,
      onFailure,
    });
    return { cancel, onOpen, onRetry, onFailure };
  }

  it("retries a failed connection and hands off the successful socket", () => {
    const result = start();
    FakeSocket.sockets[0]!.onerror?.();
    expect(result.onRetry).toHaveBeenCalledOnce();
    expect(FakeSocket.sockets[0]!.closed).toBe(true);
    vi.advanceTimersByTime(500);
    const second = FakeSocket.sockets[1]!;
    second.onopen?.();
    expect(result.onOpen).toHaveBeenCalledWith(second);
    result.cancel();
    expect(second.closed).toBe(false);
    expect(result.onFailure).not.toHaveBeenCalled();
  });

  it("reports failure after a bounded number of attempts", () => {
    const result = start();
    for (const delay of [500, 1000, 2000]) {
      FakeSocket.sockets.at(-1)!.onerror?.();
      vi.advanceTimersByTime(delay);
    }
    FakeSocket.sockets.at(-1)!.onerror?.();
    expect(FakeSocket.sockets).toHaveLength(4);
    expect(result.onFailure).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(FakeSocket.sockets).toHaveLength(4);
  });

  it("times out a stalled attempt and cancels pending retries", () => {
    const result = start();
    vi.advanceTimersByTime(10000);
    expect(result.onRetry).toHaveBeenCalledOnce();
    result.cancel();
    vi.runAllTimers();
    expect(FakeSocket.sockets).toHaveLength(1);
    expect(result.onFailure).not.toHaveBeenCalled();
  });
});

describe("Forge active-game reconnection", () => {
  beforeEach(() => {
    FakeSocket.sockets = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("times out a stalled connection and resumes through the next socket", () => {
    const bind = vi.fn();
    const onRetry = vi.fn();
    const onFailure = vi.fn();
    const cancel = reconnectOnlineGame({
      address: "wss://example.com/forge",
      credentials: { room: "room", token: "token" },
      bind,
      onRetry,
      onFailure,
    });
    vi.advanceTimersByTime(10000);
    expect(FakeSocket.sockets[0]!.closed).toBe(true);
    expect(onRetry).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(500);
    const second = FakeSocket.sockets[1]!;
    second.onopen?.();
    expect(bind).toHaveBeenCalledWith(second);
    expect(JSON.parse(second.messages[0]!)).toEqual({
      type: "resume",
      room: "room",
      token: "token",
    });
    expect(onFailure).not.toHaveBeenCalled();
    cancel();
    expect(second.closed).toBe(false);
  });

  it("offers recovery after four stalled connection attempts", () => {
    const onFailure = vi.fn();
    reconnectOnlineGame({
      address: "wss://example.com/forge",
      credentials: { room: "room", token: "token" },
      bind: vi.fn(),
      onRetry: vi.fn(),
      onFailure,
    });
    vi.runAllTimers();
    expect(FakeSocket.sockets).toHaveLength(4);
    expect(onFailure).toHaveBeenCalledOnce();
  });
});
