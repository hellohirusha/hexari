import { useEffect, useRef, useState } from "react";
import type { OnlineSession, Seat } from "./online/session";
import { loadAccountClient } from "./account";
import { validOnlineAddress } from "./online/address";
import { getOrCreateNickname } from "./nickname";
import { createForgeInviteUrl } from "./online/invite";

export type OnlineConnection = {
  socket: WebSocket;
  seat: Seat;
  session: OnlineSession;
  peerConnected: boolean;
};

export const ONLINE_SESSION_KEY = "forge-online-session";
/** Only start a new search once the old game is closed or known to be gone. */
export function canSearchAfterClosed(
  startingNew: boolean,
  code: unknown,
  reason: unknown,
): boolean {
  return (
    startingNew &&
    (code === "opponent_left" ||
      (typeof reason === "string" && reason.includes("no longer available")))
  );
}
export function onlineCredentials(): { room: string; token: string } | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(ONLINE_SESSION_KEY) ?? "null",
    );
    return typeof value?.room === "string" && typeof value?.token === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}

export default function ForgeOnlineLobby({
  onClose,
  onReady,
  onAccount,
}: {
  onClose: () => void;
  onReady: (connection: OnlineConnection) => void;
  onAccount: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const ready = useRef(onReady);
  const handedOff = useRef(false);
  const candidateSocket = useRef<WebSocket | null>(null);
  const abandoningAccountGame = useRef(false);
  const joiningInviteAfterLeave = useRef(false);
  const switchingToInvite = useRef(false);
  const [accountGame, setAccountGame] = useState<OnlineConnection | null>(null);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteCopyError, setInviteCopyError] = useState(false);
  const [searchReady, setSearchReady] = useState(false);
  const room = new URLSearchParams(window.location.hash.slice(1)).get(
    "forge-room",
  );
  const address =
    import.meta.env.VITE_FORGE_SERVER_URL ||
    (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
      ? "ws://localhost:8787/forge"
      : "");
  const [status, setStatus] = useState(
    !address
      ? "Online server is not configured."
      : validOnlineAddress(address)
        ? "Finding a player..."
        : "The online server address must use secure WebSockets.",
  );
  const [failed, setFailed] = useState(
    !address || !validOnlineAddress(address),
  );
  const [attempt, setAttempt] = useState(0);
  const [ignoreInvite, setIgnoreInvite] = useState(false);
  const [mode, setMode] = useState<
    "choose" | "resume" | "new" | "search" | "invite" | "joinInvite"
  >(() => (onlineCredentials() ? "choose" : "search"));
  useEffect(() => {
    ready.current = onReady;
  }, [onReady]);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    if (mode === "choose" || !validOnlineAddress(address)) return;
    let active = true;
    let socket: WebSocket;
    let peerConnected = true;
    let receivedError = false;
    let accountGameFound = false;
    let leaveRequested = false;
    try {
      socket = new WebSocket(address);
      candidateSocket.current = socket;
    } catch {
      queueMicrotask(() => {
        if (active) {
          setStatus("Invalid multiplayer server address.");
          setFailed(true);
        }
      });
      return () => {
        active = false;
      };
    }
    socket.onopen = async () => {
      const saved = onlineCredentials();
      try {
        let accessToken: string | undefined;
        if (!saved) {
          const client = await loadAccountClient();
          const result = await client?.auth.getSession();
          if (result?.error) throw result.error;
          accessToken = result?.data.session?.access_token;
        }
        if (active && socket.readyState === WebSocket.OPEN)
          socket.send(
            JSON.stringify(
              mode === "invite"
                ? {
                    type: "create",
                    nickname: getOrCreateNickname(),
                    ...(accessToken ? { accessToken } : {}),
                  }
                : saved
                  ? { type: "resume", ...saved }
                  : room && !ignoreInvite
                    ? {
                        type: "join",
                        room,
                        nickname: getOrCreateNickname(),
                        ...(accessToken ? { accessToken } : {}),
                      }
                    : {
                        type: "findMatch",
                        nickname: getOrCreateNickname(),
                        ...(accessToken ? { accessToken } : {}),
                      },
            ),
          );
      } catch {
        if (active) {
          setStatus("Could not load your account. Please sign in again.");
          setFailed(true);
        }
        receivedError = true;
        socket.close();
      }
    };
    socket.onmessage = (event) => {
      if (!active) return;
      try {
        const data = JSON.parse(String(event.data));
        if (
          data.type === "credentials" &&
          typeof data.room === "string" &&
          typeof data.token === "string"
        ) {
          sessionStorage.setItem(
            ONLINE_SESSION_KEY,
            JSON.stringify({ room: data.room, token: data.token }),
          );
        } else if (
          data.type === "created" &&
          mode === "invite" &&
          typeof data.room === "string" &&
          typeof data.nickname === "string"
        ) {
          setInviteLink(
            createForgeInviteUrl(
              window.location.href,
              data.room,
              data.nickname,
            ),
          );
          setStatus("Waiting for your friend to join...");
        } else if (data.type === "account-game-found") accountGameFound = true;
        else if (data.type === "peer-disconnected") peerConnected = false;
        else if (data.type === "peer-reconnected") peerConnected = true;
        else if (data.type === "waiting") {
          setSearchReady(true);
          setStatus("Looking for another player...");
        } else if (
          data.type === "search-cancelled" &&
          switchingToInvite.current
        ) {
          switchingToInvite.current = false;
          setSearchReady(false);
          setStatus("Creating invite...");
          setMode("invite");
        } else if (
          data.type === "state" &&
          (data.seat === 0 || data.seat === 1)
        ) {
          if (mode === "new" || mode === "joinInvite") {
            if (!leaveRequested) {
              leaveRequested = true;
              setStatus("Leaving your previous game...");
              socket.send(JSON.stringify({ type: "leave" }));
            }
            return;
          }
          if (accountGameFound) {
            if (abandoningAccountGame.current) return;
            setAccountGame({
              socket,
              seat: data.seat,
              session: data.session,
              peerConnected,
            });
            return;
          }
          handedOff.current = true;
          socket.onmessage = null;
          ready.current({
            socket,
            seat: data.seat,
            session: data.session,
            peerConnected,
          });
        } else if (
          data.type === "closed" &&
          canSearchAfterClosed(
            mode === "new" ||
              mode === "joinInvite" ||
              abandoningAccountGame.current,
            data.code,
            data.reason,
          )
        ) {
          const joiningInvite =
            mode === "joinInvite" || joiningInviteAfterLeave.current;
          receivedError = true;
          abandoningAccountGame.current = false;
          joiningInviteAfterLeave.current = false;
          setAccountGame(null);
          sessionStorage.removeItem(ONLINE_SESSION_KEY);
          socket.close();
          setFailed(false);
          setStatus("Finding a player...");
          setIgnoreInvite(!joiningInvite);
          if (mode === "search") setAttempt((value) => value + 1);
          else setMode("search");
        } else if (data.type === "error" || data.type === "closed") {
          receivedError = true;
          abandoningAccountGame.current = false;
          joiningInviteAfterLeave.current = false;
          setAccountGame(null);
          if (
            data.type === "closed" &&
            typeof data.reason === "string" &&
            data.reason.includes("no longer available")
          )
            sessionStorage.removeItem(ONLINE_SESSION_KEY);
          setStatus(String(data.reason));
          setFailed(true);
          socket.close();
        }
      } catch {
        receivedError = true;
        setStatus("The multiplayer server sent an invalid response.");
        setFailed(true);
        socket.close();
      }
    };
    socket.onerror = () => {
      if (active) {
        setAccountGame(null);
        abandoningAccountGame.current = false;
        joiningInviteAfterLeave.current = false;
        receivedError = true;
        setStatus("Could not connect to the multiplayer server.");
        setFailed(true);
      }
    };
    socket.onclose = () => {
      if (active && !handedOff.current && !receivedError) {
        setAccountGame(null);
        abandoningAccountGame.current = false;
        joiningInviteAfterLeave.current = false;
        setStatus("Connection closed. Try again.");
        setFailed(true);
      }
    };
    return () => {
      active = false;
      if (!handedOff.current) {
        socket.close();
        if (mode === "invite") sessionStorage.removeItem(ONLINE_SESSION_KEY);
      }
    };
  }, [address, room, attempt, mode, ignoreInvite]);
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
      {accountGame ? (
        <>
          <p>You have an online game in progress.</p>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              handedOff.current = true;
              if (candidateSocket.current)
                candidateSocket.current.onmessage = null;
              ready.current(accountGame);
            }}
          >
            Resume game
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              try {
                if (accountGame.socket.readyState !== WebSocket.OPEN)
                  throw new Error("Connection closed");
                joiningInviteAfterLeave.current = false;
                abandoningAccountGame.current = true;
                setAccountGame(null);
                setStatus("Leaving your previous game...");
                accountGame.socket.send(JSON.stringify({ type: "leave" }));
              } catch {
                abandoningAccountGame.current = false;
                setAccountGame(null);
                setFailed(true);
                setStatus("Could not leave your previous game. Try again.");
              }
            }}
          >
            Start new game
          </button>
          {room && (
            <button
              type="button"
              className="button ghost"
              onClick={() => {
                try {
                  if (accountGame.socket.readyState !== WebSocket.OPEN)
                    throw new Error("Connection closed");
                  joiningInviteAfterLeave.current = true;
                  abandoningAccountGame.current = true;
                  setAccountGame(null);
                  setStatus(
                    "Leaving your previous game before joining the invite...",
                  );
                  accountGame.socket.send(JSON.stringify({ type: "leave" }));
                } catch {
                  joiningInviteAfterLeave.current = false;
                  abandoningAccountGame.current = false;
                  setAccountGame(null);
                  setFailed(true);
                  setStatus("Could not leave your previous game. Try again.");
                }
              }}
            >
              Leave current game and join invite
            </button>
          )}
        </>
      ) : mode === "choose" ? (
        <>
          <p>You have an online game in progress.</p>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setFailed(false);
              setStatus("Resuming your game...");
              setMode("resume");
            }}
          >
            Resume game
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              setFailed(false);
              setStatus("Connecting to your previous game...");
              setMode("new");
            }}
          >
            Start new game
          </button>
          {room && (
            <button
              type="button"
              className="button ghost"
              onClick={() => {
                setFailed(false);
                setStatus(
                  "Leaving your previous game before joining the invite...",
                );
                setMode("joinInvite");
              }}
            >
              Leave current game and join invite
            </button>
          )}
        </>
      ) : (
        <p role="status">{status}</p>
      )}
      {mode === "invite" && inviteLink && !failed && !accountGame && (
        <div className="forge-invite-share">
          <label>
            Invite link
            <input
              readOnly
              value={inviteLink}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button
            type="button"
            className="button ghost"
            onClick={async () => {
              try {
                if (!navigator.clipboard?.writeText)
                  throw new Error("Clipboard unavailable");
                await navigator.clipboard.writeText(inviteLink);
                setInviteCopied(true);
                setInviteCopyError(false);
              } catch {
                setInviteCopied(false);
                setInviteCopyError(true);
              }
            }}
          >
            {inviteCopied ? "Copied" : "Copy invite link"}
          </button>
          {inviteCopyError && (
            <p role="status">Select the link above to copy it manually.</p>
          )}
        </div>
      )}
      {mode === "search" &&
        (!room || ignoreInvite) &&
        !failed &&
        !accountGame &&
        searchReady && (
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              setInviteLink("");
              setInviteCopied(false);
              setInviteCopyError(false);
              const socket = candidateSocket.current;
              if (!socket || socket.readyState !== WebSocket.OPEN) {
                setFailed(true);
                setStatus("Connection closed. Try again.");
                return;
              }
              switchingToInvite.current = true;
              setSearchReady(false);
              setStatus("Leaving matchmaking...");
              try {
                socket.send(JSON.stringify({ type: "cancelSearch" }));
              } catch {
                switchingToInvite.current = false;
                setFailed(true);
                setStatus("Could not leave matchmaking. Try again.");
              }
            }}
          >
            Invite a friend
          </button>
        )}
      <button type="button" className="button ghost" onClick={onAccount}>
        Account
      </button>
      {mode !== "choose" && failed && validOnlineAddress(address) && (
        <button
          type="button"
          className="button primary"
          onClick={() => {
            setFailed(false);
            setSearchReady(false);
            switchingToInvite.current = false;
            setInviteLink("");
            setInviteCopied(false);
            setInviteCopyError(false);
            setStatus(
              mode === "invite" ? "Creating invite..." : "Finding a player...",
            );
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </button>
      )}
    </dialog>
  );
}
