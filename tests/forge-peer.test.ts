import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPeerTransport } from "../src/forge/online/peer";

class FakeChannel {
  readyState = "open";
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror = null;
  send = vi.fn();
  close = vi.fn();
}
class FakePeer {
  static instances: FakePeer[] = [];
  channel = new FakeChannel();
  connectionState = "new";
  remoteDescription: RTCSessionDescriptionInit | null = null;
  localDescription: {
    type: RTCSdpType;
    toJSON: () => RTCSessionDescriptionInit;
  } | null = null;
  ondatachannel = null;
  onicecandidate = null;
  onconnectionstatechange = null;
  createDataChannel = vi.fn(() => this.channel);
  createOffer = vi.fn(async () => ({ type: "offer" as const, sdp: "offer" }));
  createAnswer = vi.fn(async () => ({
    type: "answer" as const,
    sdp: "answer",
  }));
  setLocalDescription = vi.fn(
    async (description: RTCSessionDescriptionInit) => {
      this.localDescription = {
        type: description.type,
        toJSON: () => description,
      };
    },
  );
  setRemoteDescription = vi.fn(
    async (description: RTCSessionDescriptionInit) => {
      this.remoteDescription = description;
    },
  );
  addIceCandidate = vi.fn(async () => {});
  close = vi.fn();
  constructor() {
    FakePeer.instances.push(this);
  }
}

describe("Forge peer transport", () => {
  beforeEach(() => {
    FakePeer.instances = [];
    vi.stubGlobal("RTCPeerConnection", FakePeer);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("starts an ordered channel and sends an offer without exposing a code to the player", async () => {
    const sendSignal = vi.fn(async () => {});
    const peer = createPeerTransport({
      initiator: true,
      iceServers: [],
      sendSignal,
      onMessage: vi.fn(),
      onState: vi.fn(),
      onError: vi.fn(),
    });
    await peer.start();
    expect(FakePeer.instances[0].createDataChannel).toHaveBeenCalledWith(
      "forge",
      { ordered: true },
    );
    expect(sendSignal).toHaveBeenCalledWith({
      type: "offer",
      description: { type: "offer", sdp: "offer" },
    });
    peer.send("hello");
    expect(FakePeer.instances[0].channel.send).toHaveBeenCalledWith("hello");
    peer.close();
    expect(() => peer.send("later")).toThrow();
  });
  it("buffers ICE candidates until the offer arrives and rejects descriptions for the wrong role", async () => {
    const sendSignal = vi.fn(async () => {});
    const peer = createPeerTransport({
      initiator: false,
      iceServers: [],
      sendSignal,
      onMessage: vi.fn(),
      onState: vi.fn(),
      onError: vi.fn(),
    });
    await peer.receiveSignal({
      type: "candidate",
      candidate: { candidate: "candidate" },
    });
    expect(FakePeer.instances[0].addIceCandidate).not.toHaveBeenCalled();
    await peer.receiveSignal({
      type: "offer",
      description: { type: "offer", sdp: "offer" },
    });
    expect(FakePeer.instances[0].addIceCandidate).toHaveBeenCalledOnce();
    expect(sendSignal).toHaveBeenCalledWith({
      type: "answer",
      description: { type: "answer", sdp: "answer" },
    });
    await expect(
      peer.receiveSignal({ type: "answer", description: { type: "answer" } }),
    ).rejects.toThrow("Unexpected");
    peer.close();
  });
});
