import { describe, expect, it } from "vitest";
import { validOnlineAddress } from "../src/forge/online/address";

describe("online multiplayer endpoint", () => {
  it("allows secure endpoints and local development", () => {
    expect(validOnlineAddress("wss://game.example/forge")).toBe(true);
    expect(validOnlineAddress("ws://localhost:8787/forge")).toBe(true);
    expect(validOnlineAddress("ws://127.0.0.1:8787/forge")).toBe(true);
  });
  it("rejects insecure remote, embedded credentials and incorrect paths", () => {
    expect(validOnlineAddress("ws://game.example/forge")).toBe(false);
    expect(validOnlineAddress("wss://user:pass@game.example/forge")).toBe(
      false,
    );
    expect(validOnlineAddress("wss://game.example/other")).toBe(false);
    expect(validOnlineAddress("wss://game.example/forge?token=secret")).toBe(
      false,
    );
    expect(validOnlineAddress("https://game.example/forge")).toBe(false);
  });
});
