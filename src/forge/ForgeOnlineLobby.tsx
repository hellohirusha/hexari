import { useEffect, useRef, useState } from "react";
import type { OnlineSession, Seat } from "./online/session";

export type OnlineConnection = {
  socket: WebSocket;
  seat: Seat;
  session: OnlineSession;
};

export default function ForgeOnlineLobby({
  onClose,
  onReady,
}: {
  onClose: () => void;
  onReady: (connection: OnlineConnection) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const connection = useRef<WebSocket | null>(null);
  const handedOff = useRef(false);
  const [invite, setInvite] = useState("");
  const [status, setStatus] = useState(
    "Create a game and share the invite link, or join an invite.",
  );
  const room = new URLSearchParams(window.location.hash.slice(1)).get(
    "forge-room",
  );
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (!handedOff.current) connection.current?.close();
    };
  }, []);
  function connect(join: boolean) {
    if (connection.current) return;
    const configured = import.meta.env.VITE_FORGE_SERVER_URL;
    const address =
      configured ||
      (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
        ? "ws://localhost:8787/forge"
        : "");
    if (!address) {
      setStatus("Online server is not configured.");
      return;
    }
    setStatus("Connecting to the multiplayer server...");
    let socket: WebSocket;
    try {
      socket = new WebSocket(address);
    } catch {
      setStatus("Invalid multiplayer server address.");
      return;
    }
    connection.current = socket;
    socket.onopen = () =>
      socket.send(
        JSON.stringify(join ? { type: "join", room } : { type: "create" }),
      );
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));
        if (data.type === "created") {
          const url = new URL(window.location.href);
          url.hash = new URLSearchParams({
            "forge-room": data.room,
          }).toString();
          setInvite(url.toString());
          setStatus("Waiting for the other player to open your invite.");
        } else if (
          data.type === "state" &&
          (data.seat === 0 || data.seat === 1)
        ) {
          handedOff.current = true;
          socket.onmessage = null;
          onReady({ socket, seat: data.seat, session: data.session });
        } else if (data.type === "error" || data.type === "closed") {
          setStatus(data.reason);
          socket.onclose = null;
          connection.current = null;
          socket.close();
        }
      } catch {
        setStatus("The multiplayer server sent an invalid response.");
      }
    };
    socket.onerror = () =>
      setStatus("Could not connect to the multiplayer server.");
    socket.onclose = () => {
      if (!handedOff.current) {
        connection.current = null;
        setStatus("Connection closed. Try again.");
      }
    };
  }
  return (
    <dialog
      ref={dialog}
      className="forge-confirm forge-mode-dialog forge-online-lobby"
      aria-labelledby="forge-online-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="forge-mode-dialog-heading">
        <h2 id="forge-online-title">Online game</h2>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <p role="status">{status}</p>
      {invite && (
        <label>
          Invite link{" "}
          <input
            readOnly
            value={invite}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="forge-welcome-actions">
        {!invite && (
          <button
            type="button"
            className="button primary"
            onClick={() => connect(Boolean(room))}
          >
            {room ? "Join game" : "Create game"}
          </button>
        )}
        {invite && (
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              void navigator.clipboard.writeText(invite).then(
                () => setStatus("Invite copied. Waiting for the other player."),
                () => setStatus("Select and copy the invite link."),
              );
            }}
          >
            Copy invite
          </button>
        )}
      </div>
    </dialog>
  );
}
