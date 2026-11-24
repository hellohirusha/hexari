type LobbyConnectionOptions = {
  address: string;
  onOpen: (socket: WebSocket) => void;
  onRetry: () => void;
  onFailure: () => void;
};

// Railway may need a short time to wake or replace a replica. Retry only the
// initial transport connection; protocol and account errors must remain visible.
export function connectLobbyWithRetry({
  address,
  onOpen,
  onRetry,
  onFailure,
}: LobbyConnectionOptions): () => void {
  const maxAttempts = 4;
  let attempts = 0;
  let cancelled = false;
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function clearAttempt() {
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = undefined;
    if (socket) {
      socket.onopen = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
      socket = null;
    }
  }

  function failed() {
    if (cancelled || !socket) return;
    clearAttempt();
    if (attempts >= maxAttempts) {
      onFailure();
      return;
    }
    onRetry();
    retryTimer = setTimeout(connect, 500 * 2 ** (attempts - 1));
  }

  function connect() {
    if (cancelled) return;
    attempts += 1;
    try {
      socket = new WebSocket(address);
    } catch {
      onFailure();
      return;
    }
    const connecting = socket;
    connecting.onopen = () => {
      if (cancelled || socket !== connecting) return;
      if (timeout !== undefined) clearTimeout(timeout);
      timeout = undefined;
      connecting.onopen = null;
      connecting.onerror = null;
      connecting.onclose = null;
      socket = null;
      onOpen(connecting);
    };
    connecting.onerror = failed;
    connecting.onclose = failed;
    timeout = setTimeout(failed, 10000);
  }

  connect();
  return () => {
    cancelled = true;
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    clearAttempt();
  };
}
