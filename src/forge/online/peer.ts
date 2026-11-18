/** The matchmaking service exchanges these messages only while connecting. */
export type PeerSignal =
  | { type: "offer" | "answer"; description: RTCSessionDescriptionInit }
  | { type: "candidate"; candidate: RTCIceCandidateInit };

export type PeerTransport = {
  start: () => Promise<void>;
  receiveSignal: (signal: PeerSignal) => Promise<void>;
  send: (message: string) => void;
  close: () => void;
};

/** An ordered data channel. Matchmaking and TURN configuration are supplied externally. */
export function createPeerTransport(options: {
  initiator: boolean;
  iceServers: RTCIceServer[];
  sendSignal: (signal: PeerSignal) => Promise<void>;
  onMessage: (message: string) => void;
  onState: (state: RTCPeerConnectionState) => void;
  onError: (error: unknown) => void;
}): PeerTransport {
  const peer = new RTCPeerConnection({ iceServers: options.iceServers });
  let channel: RTCDataChannel | null = null;
  let closed = false;
  let signalQueue = Promise.resolve();
  const pendingCandidates: RTCIceCandidateInit[] = [];

  function observeChannel(next: RTCDataChannel) {
    if (channel || closed) {
      next.close();
      return;
    }
    channel = next;
    next.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data === "string" && event.data.length <= 65536)
        options.onMessage(event.data);
    };
    next.onerror = (event) => options.onError(event);
  }

  peer.ondatachannel = (event) => observeChannel(event.channel);
  peer.onicecandidate = (event) => {
    if (!closed && event.candidate)
      void options
        .sendSignal({ type: "candidate", candidate: event.candidate.toJSON() })
        .catch(options.onError);
  };
  peer.onconnectionstatechange = () => options.onState(peer.connectionState);

  return {
    async start() {
      if (closed) throw new Error("Connection is closed.");
      if (!options.initiator) return;
      if (channel) throw new Error("Connection already started.");
      observeChannel(peer.createDataChannel("forge", { ordered: true }));
      await peer.setLocalDescription(await peer.createOffer());
      if (!peer.localDescription) throw new Error("Could not create an offer.");
      await options.sendSignal({
        type: "offer",
        description: peer.localDescription.toJSON(),
      });
    },
    receiveSignal(signal) {
      const task = signalQueue.then(async () => {
        if (closed) return;
        if (signal.type === "candidate") {
          if (!peer.remoteDescription) pendingCandidates.push(signal.candidate);
          else await peer.addIceCandidate(signal.candidate);
          return;
        }
        if (
          (signal.type === "offer") === options.initiator ||
          signal.description.type !== signal.type
        )
          throw new Error("Unexpected connection description.");
        await peer.setRemoteDescription(signal.description);
        for (const candidate of pendingCandidates.splice(0))
          await peer.addIceCandidate(candidate);
        if (signal.type === "offer") {
          await peer.setLocalDescription(await peer.createAnswer());
          if (!peer.localDescription)
            throw new Error("Could not create an answer.");
          await options.sendSignal({
            type: "answer",
            description: peer.localDescription.toJSON(),
          });
        }
      });
      signalQueue = task.catch(() => {});
      return task;
    },
    send(message) {
      if (message.length > 65536) throw new Error("Message is too large.");
      if (closed || !channel || channel.readyState !== "open")
        throw new Error("Player is not connected.");
      channel.send(message);
    },
    close() {
      if (closed) return;
      closed = true;
      peer.onicecandidate = null;
      peer.ondatachannel = null;
      peer.onconnectionstatechange = null;
      if (channel) {
        channel.onmessage = null;
        channel.onerror = null;
        channel.close();
      }
      peer.close();
    },
  };
}
