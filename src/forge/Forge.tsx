import { initialTheme } from "../shared/ThemeToggle";
import "./forge.css";
import PixiTerrain from "../shared/PixiLayer";
import { playBotDiscard, playBotTurn } from "./bot";
import {
  soundCue,
  prepareSoundEffects,
  prepareResultSounds,
  setMasterVolume,
  startWelcomeMusic,
  stopSoundEffects,
  type Cue,
  type WelcomeMusicPlayer,
} from "./sound";
import { BuildingArt, TerrainArt } from "../shared/TerrainArt";
import ForgeActivity, {
  onlineChatPlayerName,
  type ChatMessage,
} from "./ForgeActivity";
import ForgeGuide from "./ForgeGuide";
import ForgeCoach, { clearLocalForgeCoachHistory } from "./ForgeCoach";
import Die from "./Die";
import ForgeMarket from "./ForgeMarket";
import ForgeConfirm from "./ForgeConfirm";
import ForgeModeDialog from "./ForgeModeDialog";
import ForgeOnlineLobby, {
  ONLINE_SESSION_KEY,
  onlineCredentials,
  type OnlineConnection,
} from "./ForgeOnlineLobby";
import {
  loadAccountClient,
  refreshAfterSignupConfirmation,
  validPlayerName,
} from "./account";
import { getBotNickname, getOrCreateNickname } from "./nickname";
import type { Session } from "@supabase/supabase-js";
import { useLocalGameStats } from "./localGameStats";
import ForgeOnlineTrade from "./ForgeOnlineTrade";
import type { OnlineCommand, OnlineSession, Seat } from "./online/session";
import { isOpponentDeparture } from "./online/opponentDeparture";
import { linkOnlineAccount } from "./online/accountLink";
import { reconnectOnlineGame } from "./online/lobbyConnection";
import { FONT_SIZE_KEY, readFontSize } from "./fontSize";
import ForgeSettings from "./ForgeSettings";
import ForgePause from "./ForgePause";
import ForgeGameMenu from "./ForgeGameMenu";
import ForgeResult from "./ForgeResult";
import ForgeFullscreen from "./ForgeFullscreen";
import { turnTimeRemaining } from "./turnClock";
import ForgeOpponentLeftNotice from "./ForgeOpponentLeftNotice";
import ForgeBuildPopover from "./ForgeBuildPopover";
import ForgeBuildCards from "./ForgeBuildCards";
import { useResourceMotion } from "./ForgeResourceMotion";
import { transfersForAction } from "./resourceTransfers";
import { placementSound } from "./placementSound";
import { useResultAudio } from "./useResultAudio";
import { buildKinds, buildOptions } from "./buildOptions";
import { parseResumableGame } from "./savedGame";
import { watchFocusLoss } from "./focusPause";
import { applyTurnTimeout } from "./turnTimeout";
import { matchingRollTiles } from "./rollHighlight";
import { turnLabel } from "./turnLabel";
import { newPlacementKeys, roadPlacementKey } from "./placementAnimation";
import { useOpeningPlacements } from "./useOpeningPlacements";
import BrandMark from "../shared/BrandMark";
import ForgeScoreName from "./ForgeScoreName";
import { hexariHomeHref } from "../shared/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { centers, defaultBoard, vertices } from "./board";
const forgeGeometry = { centers, x: 5, y: -10, width: 470, height: 390 };
import {
  goods,
  legalRoad,
  legalSetupRoad,
  legalSetupSettlement,
  setupNeedsRoad,
  legalSettlement,
  newGame,
  totalPoints,
  longestRoadOwner,
  transition,
  type Game,
  type Goods,
  type Building,
} from "./engine";

const terrain = {
  wood: "#456e54",
  brick: "#b56e4f",
  wheat: "#d6ad5b",
  ore: "#788792",
  sheep: "#88a56d",
  desert: "#d2bd8b",
};
const key = "hexari-forge-v1";
// These functions are called in event handlers, never while rendering.
function eventTime() {
  return Date.now();
}
function eventDie() {
  return Math.floor(Math.random() * 6) + 1;
}
function storedList<T>(
  storageKey: string,
  valid: (item: unknown) => item is T,
): T[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(items) ? items.filter(valid).slice(-100) : [];
  } catch {
    return [];
  }
}
function restore(): Game {
  try {
    return (
      parseResumableGame(localStorage.getItem(key)) ??
      newGame(undefined, { manualSetup: true })
    );
  } catch {
    /* start fresh */
  }
  return newGame(undefined, { manualSetup: true });
}
export default function Forge({
  standalone = false,
}: {
  standalone?: boolean;
}) {
  const [game, setGame] = useState<Game>(restore),
    [started, setStarted] = useState(false),
    [modeDialogOpen, setModeDialogOpen] = useState(false),
    [pendingConfirmation, setPendingConfirmation] = useState<
      "welcome-bot" | "welcome-hotseat" | "restart" | "bot" | "hotseat" | null
    >(null),
    [hasSavedGame, setHasSavedGame] = useState(() => {
      try {
        return parseResumableGame(localStorage.getItem(key)) !== null;
      } catch {
        return false;
      }
    }),
    [pixiReady, setPixiReady] = useState(false),
    [opponent, setOpponent] = useState<"bot" | "hotseat" | "online">(() => {
      const savedMode = localStorage.getItem("hexari-forge-mode");
      return savedMode === "hotseat" ||
        (!savedMode && localStorage.getItem(key))
        ? "hotseat"
        : "bot";
    }),
    [sound, setSound] = useState(
      () => localStorage.getItem("hexari-sound") !== "off",
    ),
    [volume, setVolume] = useState(() => {
      const raw = localStorage.getItem("forge-volume");
      const value = raw === null ? 1 : Number(raw);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    }),
    [fontSize, setFontSize] = useState(() => {
      try {
        return readFontSize(localStorage.getItem(FONT_SIZE_KEY));
      } catch {
        return readFontSize(null);
      }
    }),
    [shortcuts, setShortcuts] = useState(
      () => localStorage.getItem("forge-shortcuts") !== "off",
    ),
    [diceFaces, setDiceFaces] = useState<[number, number] | null>(null),
    [diceAnimation, setDiceAnimation] = useState(0),
    [target, setTarget] = useState<{ at: number; to?: number } | null>(null),
    [buildSelection, setBuildSelection] = useState<{
      building: Building;
      turnStarted: number;
    } | null>(null),
    [settingsOpen, setSettingsOpen] = useState(() =>
      ["recovery", "confirm"].includes(
        new URLSearchParams(window.location.search).get("account") ?? "",
      ),
    ),
    [resultDismissed, setResultDismissed] = useState(false),
    [resultCelebrated, setResultCelebrated] = useState(false),
    [menuOpen, setMenuOpen] = useState(false),
    [pausedAt, setPausedAt] = useState<number | null>(null),
    [clock, setClock] = useState(() => Date.now()),
    [message, setMessage] = useState(""),
    [activity, setActivity] = useState<string[]>(() =>
      storedList(
        "hexari-forge-activity",
        (x): x is string => typeof x === "string",
      ),
    ),
    [chat, setChat] = useState<ChatMessage[]>(() =>
      storedList("hexari-forge-chat", (x): x is ChatMessage =>
        Boolean(
          x &&
          typeof x === "object" &&
          "player" in x &&
          typeof x.player === "string" &&
          "text" in x &&
          typeof x.text === "string",
        ),
      ),
    );
  const [onlineLobby, setOnlineLobby] = useState(
    () =>
      !["recovery", "confirm"].includes(
        new URLSearchParams(window.location.search).get("account") ?? "",
      ) &&
      (new URLSearchParams(window.location.hash.slice(1)).has("forge-room") ||
        !!onlineCredentials()),
  );
  const [coachGeneration, setCoachGeneration] = useState(0);
  const [guestNickname] = useState(getOrCreateNickname);
  const [botNickname] = useState(getBotNickname);
  const [account, setAccount] = useState<{
    signedIn: boolean;
    id: string | null;
    name: string | null;
  }>({ signedIn: false, id: null, name: null });
  const [accountReady, setAccountReady] = useState(false);
  useLocalGameStats(game, started && accountReady, opponent, account.id);
  const startedRef = useRef(started);
  useLayoutEffect(() => {
    startedRef.current = started;
  }, [started]);
  const canReloadAfterConfirmation = useCallback(() => !startedRef.current, []);
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    let authVersion = 0;
    const updateAccount = (session: Session | null) => {
      if (!active) return;
      const name: unknown = session?.user.user_metadata.display_name;
      setAccount({
        signedIn: !!session,
        id: session?.user.id ?? null,
        name:
          typeof name === "string" && validPlayerName(name)
            ? name.trim()
            : null,
      });
      setAccountReady(true);
    };
    void loadAccountClient()
      .then(async (client) => {
        if (!active) return;
        if (!client) {
          setAccountReady(true);
          return;
        }
        const { data } = client.auth.onAuthStateChange((event, session) => {
          authVersion++;
          updateAccount(session);
          refreshAfterSignupConfirmation(
            event,
            session,
            canReloadAfterConfirmation,
          );
        });
        unsubscribe = () => data.subscription.unsubscribe();
        const version = authVersion;
        const result = await client.auth.getSession();
        if (version === authVersion) updateAccount(result.data.session);
      })
      .catch(() => {
        if (active) {
          setAccount({ signedIn: false, id: null, name: null });
          setAccountReady(true);
        }
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [canReloadAfterConfirmation]);
  const buildTrigger = useRef<SVGElement | null>(null);
  const [openAccount, setOpenAccount] = useState(false);
  const returnToOnline = useRef(false);
  const accountCallback = ["recovery", "confirm"].includes(
    new URLSearchParams(window.location.search).get("account") ?? "",
  );
  function closeSettings() {
    setSettingsOpen(false);
    setOpenAccount(false);
    if (accountCallback) {
      const url = new URL(window.location.href);
      url.searchParams.delete("account");
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
      if (onlineCredentials()) setOnlineLobby(true);
    }
    if (returnToOnline.current) {
      returnToOnline.current = false;
      setOnlineLobby(true);
    }
  }
  const [online, setOnline] = useState<{
    seat: Seat;
    session: OnlineSession;
    connected: boolean;
    pending: boolean;
    recoverable?: boolean;
  } | null>(null);
  const [opponentNotice, setOpponentNotice] = useState<
    "disconnected" | "left" | "recoverable" | null
  >(null);
  const [peerResumed, setPeerResumed] = useState(false);
  useEffect(() => {
    if (!peerResumed) return;
    const timer = setTimeout(() => setPeerResumed(false), 4000);
    return () => clearTimeout(timer);
  }, [peerResumed]);
  const [startNewOnline, setStartNewOnline] = useState(false);
  const onlineSocket = useRef<WebSocket | null>(null);
  const onlineRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelOnlineReconnect = useRef<(() => void) | null>(null);
  const onlineRef = useRef(online);
  useEffect(() => {
    const accountId = account.id;
    const socket = onlineSocket.current;
    if (opponent !== "online" || !online?.connected || !accountId || !socket)
      return;
    let active = true;
    void linkOnlineAccount(
      accountId,
      async () => {
        const client = await loadAccountClient();
        if (!client) return null;
        const result = await client.auth.getSession();
        if (result.error) throw result.error;
        return result.data.session;
      },
      socket,
      () =>
        active &&
        onlineSocket.current === socket &&
        onlineRef.current?.connected === true &&
        socket.readyState === WebSocket.OPEN,
    ).catch(() => {
      if (active) setMessage("Could not link your account. Try again.");
    });
    return () => {
      active = false;
    };
  }, [account.id, account.name, online?.connected, opponent]);
  const pendingOnlineExit = useRef<"welcome" | "match" | null>(null);
  const pendingChats = useRef(
    new Map<
      string,
      { resolve: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> }
    >(),
  );
  const lastChatAttempt = useRef<{ text: string; requestId: string } | null>(
    null,
  );
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  useEffect(
    () => () => {
      if (onlineRetry.current) clearTimeout(onlineRetry.current);
      cancelOnlineReconnect.current?.();
      cancelOnlineReconnect.current = null;
      for (const pending of pendingChats.current.values()) {
        clearTimeout(pending.timer);
        pending.resolve(false);
      }
      pendingChats.current.clear();
      if (onlineSocket.current) onlineSocket.current.onclose = null;
      onlineSocket.current?.close();
    },
    [],
  );
  function onlineCommand(command: OnlineCommand): boolean {
    const current = onlineRef.current;
    if (
      !current ||
      !current.connected ||
      current.pending ||
      !onlineSocket.current ||
      onlineSocket.current.readyState !== WebSocket.OPEN
    )
      return false;
    onlineRef.current = { ...current, pending: true };
    setOnline(onlineRef.current);
    try {
      onlineSocket.current.send(
        JSON.stringify({
          type: "command",
          revision: current.session.revision,
          command,
        }),
      );
      return true;
    } catch {
      onlineRef.current = { ...current, pending: false, connected: false };
      setOnline(onlineRef.current);
      setMessage("The online connection is unavailable.");
      return false;
    }
  }
  function sendOnlineEvent(
    event:
      | { type: "chat"; text: string; requestId: string }
      | { type: "report"; id: string }
      | { type: "linkAccount"; accessToken: string },
  ): boolean {
    const socket = onlineSocket.current;
    if (
      !onlineRef.current?.connected ||
      !socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      setMessage("The online connection is unavailable.");
      return false;
    }
    try {
      socket.send(JSON.stringify(event));
      return true;
    } catch {
      setMessage("The online connection is unavailable.");
      return false;
    }
  }
  function sendOnlineChat(text: string): Promise<boolean> {
    if (!globalThis.crypto?.randomUUID) return Promise.resolve(false);
    const requestId =
      lastChatAttempt.current?.text === text
        ? lastChatAttempt.current.requestId
        : globalThis.crypto.randomUUID();
    lastChatAttempt.current = { text, requestId };
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingChats.current.delete(requestId);
        resolve(false);
      }, 12000);
      pendingChats.current.set(requestId, { resolve, timer });
      if (!sendOnlineEvent({ type: "chat", text, requestId })) {
        clearTimeout(timer);
        pendingChats.current.delete(requestId);
        resolve(false);
      }
    });
  }
  const gameRef = useRef(game);
  const { opening, beginOpening, cancelOpening } = useOpeningPlacements(
    started,
    pixiReady,
    sound,
  );
  const previousBoard = useRef<{ game: Game; started: boolean } | null>(null);
  const [animatedPlacements, setAnimatedPlacements] = useState<
    ReadonlySet<string>
  >(() => new Set());
  useLayoutEffect(() => {
    const previous = previousBoard.current;
    previousBoard.current = { game, started };
    setAnimatedPlacements(
      previous?.started && started
        ? newPlacementKeys(previous.game, game)
        : new Set(),
    );
  }, [game, started]);
  useEffect(() => {
    prepareSoundEffects();
    prepareResultSounds();
  }, []);
  const diceDisplayRef = useRef<HTMLSpanElement>(null);
  const boardSvgRef = useRef<SVGSVGElement>(null);
  const rollEffectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rollEffect, setRollEffect] = useState<{
    total: number;
    start: { x: number; y: number };
    targets: { id: number; x: number; y: number }[];
    id: number;
  } | null>(null);
  useEffect(
    () => () => {
      if (rollEffectTimer.current) clearTimeout(rollEffectTimer.current);
    },
    [],
  );
  const showRollEffect = useCallback((total: number) => {
    if (rollEffectTimer.current) clearTimeout(rollEffectTimer.current);
    const dice = diceDisplayRef.current?.getBoundingClientRect();
    const board = boardSvgRef.current;
    if (!dice || !board) return;
    const targets = matchingRollTiles(defaultBoard, total).flatMap((id) => {
      const rect = board
        .querySelector(`[data-forge-tile="${id}"]`)
        ?.getBoundingClientRect();
      return rect
        ? [{ id, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }]
        : [];
    });
    if (!targets.length) {
      setRollEffect(null);
      return;
    }
    setRollEffect({
      total,
      start: { x: dice.left + dice.width / 2, y: dice.top + dice.height / 2 },
      targets,
      id: Date.now(),
    });
    rollEffectTimer.current = setTimeout(() => setRollEffect(null), 2000);
  }, []);
  const [tableScale, setTableScale] = useState(() =>
    window.innerWidth <= 900
      ? Math.min(window.innerWidth / 1100, window.innerHeight / 740)
      : 1,
  );
  useEffect(() => {
    const resize = () =>
      setTableScale(
        window.innerWidth <= 900
          ? Math.min(window.innerWidth / 1100, window.innerHeight / 740)
          : 1,
      );
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const welcomeMusicRef = useRef<WelcomeMusicPlayer | null>(null);
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => {});
  const pauseHandler = useRef<() => void>(() => {});
  const pauseActive = useRef(false);
  function enterOnline(connection: OnlineConnection) {
    const {
      socket,
      seat,
      session,
      peerConnected: initialPeerConnected,
    } = connection;
    setPixiReady(false);
    if (
      connection.isNewGame &&
      session.revision === 0 &&
      session.game.phase === "roll"
    )
      beginOpening(session.game);
    else cancelOpening();
    onlineSocket.current = socket;
    setOpponentNotice(
      !initialPeerConnected && session.game.phase !== "end"
        ? "disconnected"
        : null,
    );
    setStartNewOnline(false);
    const current = {
      seat,
      session,
      connected: initialPeerConnected,
      pending: false,
    };
    onlineRef.current = current;
    setOnline(current);
    setOpponent("online");
    setGame(session.game);
    setResultDismissed(false);
    setResultCelebrated(false);
    setDiceFaces(null);
    setTarget(null);
    setBuildSelection(null);
    setActivity([]);
    setChat([]);
    setCoachGeneration((generation) => generation + 1);
    setMessage("");
    gameRef.current = session.game;
    setStarted(true);
    setOnlineLobby(false);
    setModeDialogOpen(false);
    welcomeMusicRef.current?.stop();
    welcomeMusicRef.current = null;
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    let peerConnected = initialPeerConnected;
    let retryUntil = 0;
    const updateConnection = (connected: boolean) => {
      if (!onlineRef.current) return;
      onlineRef.current = { ...onlineRef.current, connected, pending: false };
      setOnline(onlineRef.current);
    };
    const bind = (activeSocket: WebSocket) => {
      onlineSocket.current = activeSocket;
      let closedByServer = false;
      activeSocket.onmessage = (event) => {
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
          } else if (data.type === "peer-disconnected") {
            peerConnected = false;
            updateConnection(false);
            if (gameRef.current.phase !== "end")
              setOpponentNotice("disconnected");
            setMessage("Waiting for the other player to reconnect.");
          } else if (data.type === "peer-reconnected") {
            peerConnected = true;
            setOpponentNotice(null);
            if (
              (data.seat === 0 || data.seat === 1) &&
              data.seat !== onlineRef.current?.seat
            )
              setPeerResumed(true);
            setMessage("");
          } else if (
            data.type === "chat" &&
            typeof data.id === "string" &&
            typeof data.text === "string" &&
            (data.seat === 0 || data.seat === 1)
          ) {
            setChat((previous) =>
              previous.some((entry) => entry.id === data.id)
                ? previous
                : [
                    ...previous,
                    {
                      id: data.id,
                      player: onlineChatPlayerName(
                        data.seat,
                        seat,
                        onlineRef.current?.session.names,
                      ),
                      text: data.text,
                    },
                  ].slice(-100),
            );
          } else if (data.type === "reported" && typeof data.id === "string") {
            setChat((previous) =>
              previous.map((entry) =>
                entry.id === data.id ? { ...entry, flagged: true } : entry,
              ),
            );
          } else if (data.type === "account-linked") {
            setMessage("Account linked to this game.");
          } else if (
            data.type === "chat-result" &&
            typeof data.requestId === "string"
          ) {
            const pending = pendingChats.current.get(data.requestId);
            if (pending) {
              clearTimeout(pending.timer);
              pendingChats.current.delete(data.requestId);
              if (
                data.ok === true &&
                lastChatAttempt.current?.requestId === data.requestId
              )
                lastChatAttempt.current = null;
              pending.resolve(data.ok === true);
              if (data.ok !== true && typeof data.reason === "string")
                setMessage(data.reason);
            }
          } else if (data.type === "state") {
            const previous = onlineRef.current;
            if (!previous) return;
            const nextSession = data.session as OnlineSession;
            if (nextSession.revision === previous.session.revision + 1)
              showResourceMotion(transfersForAction(data.publicAction));
            if (
              soundRef.current &&
              nextSession.revision === previous.session.revision + 1
            ) {
              const placement = placementSound(
                previous.session.game,
                nextSession.game,
              );
              if (placement) soundCue(placement);
            }
            const updated = {
              ...previous,
              session: nextSession,
              connected: peerConnected,
              pending: false,
            };
            onlineRef.current = updated;
            setOnline(updated);
            gameRef.current = updated.session.game;
            setGame(updated.session.game);
            retryUntil = 0;
            if (peerConnected) {
              setOpponentNotice(null);
              setMessage("");
            }
            setClock(Date.now());
            setTarget(null);
            if (typeof data.activity === "string")
              setActivity((previous) =>
                [...previous, data.activity].slice(-100),
              );
            if (Array.isArray(data.dice) && data.dice.length === 2) {
              setDiceFaces([data.dice[0], data.dice[1]]);
              setDiceAnimation((n) => n + 1);
              showRollEffect(data.dice[0] + data.dice[1]);
              if (soundRef.current) soundCue("roll");
            }
          } else if (data.type === "error") {
            pendingOnlineExit.current = null;
            setMessage(String(data.reason));
            if (onlineRef.current) {
              onlineRef.current = { ...onlineRef.current, pending: false };
              setOnline(onlineRef.current);
            }
          } else if (data.type === "closed") {
            closedByServer = true;
            const destination = pendingOnlineExit.current;
            pendingOnlineExit.current = null;
            if (destination && data.recoverable !== true) {
              finishOnlineExit(destination === "match");
              return;
            }
            if (data.recoverable !== true)
              sessionStorage.removeItem(ONLINE_SESSION_KEY);
            if (gameRef.current.phase !== "end") {
              if (data.code === "opponent_timeout" && data.recoverable === true)
                setOpponentNotice("recoverable");
              else if (isOpponentDeparture(data.code, data.recoverable))
                setOpponentNotice("left");
            }
            updateConnection(false);
            if (onlineRef.current) {
              onlineRef.current = {
                ...onlineRef.current,
                recoverable: data.recoverable === true,
              };
              setOnline(onlineRef.current);
            }
            setMessage(String(data.reason));
          }
        } catch {
          setMessage("The multiplayer server sent an invalid response.");
        }
      };
      activeSocket.onclose = () => {
        if (onlineSocket.current !== activeSocket || !onlineRef.current) return;
        for (const pending of pendingChats.current.values()) {
          clearTimeout(pending.timer);
          pending.resolve(false);
        }
        pendingChats.current.clear();
        pendingOnlineExit.current = null;
        updateConnection(false);
        if (closedByServer || !onlineCredentials()) return;
        retryUntil ||= Date.now() + 55000;
        if (Date.now() >= retryUntil) {
          onlineRef.current = { ...onlineRef.current, recoverable: true };
          setOnline(onlineRef.current);
          setMessage(
            "The connection could not be restored. Resume the game to try again.",
          );
          return;
        }
        setMessage("Connection lost. Reconnecting...");
        onlineRetry.current = setTimeout(() => {
          if (!onlineRef.current) return;
          const credentials = onlineCredentials();
          if (!credentials) return;
          cancelOnlineReconnect.current = reconnectOnlineGame({
            address: activeSocket.url,
            credentials,
            bind,
            onRetry: () => setMessage("Connection lost. Reconnecting..."),
            onFailure: () => {
              if (!onlineRef.current) return;
              onlineRef.current = { ...onlineRef.current, recoverable: true };
              setOnline(onlineRef.current);
              setMessage(
                "The connection could not be restored. Resume the game to try again.",
              );
            },
          });
        }, 1500);
      };
      activeSocket.onerror = () => activeSocket.close();
    };
    bind(socket);
  }
  useEffect(() => {
    document.documentElement.dataset.theme = initialTheme(
      "forge-theme",
      "dark",
    );
  }, []);
  useEffect(() => () => stopSoundEffects(), []);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);
  useEffect(() => {
    if (started && opponent !== "online")
      localStorage.setItem(key, JSON.stringify(game));
  }, [game, started, opponent]);
  useEffect(() => {
    if (opponent !== "online")
      localStorage.setItem("hexari-forge-mode", opponent);
  }, [opponent]);
  useEffect(() => {
    localStorage.setItem("hexari-sound", sound ? "on" : "off");
  }, [sound]);
  useEffect(() => {
    setMasterVolume(volume);
    localStorage.setItem("forge-volume", String(volume));
  }, [volume]);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--forge-font-scale",
      String(fontSize / 100),
    );
    localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
    return () => {
      document.documentElement.style.removeProperty("--forge-font-scale");
    };
  }, [fontSize]);
  useEffect(() => {
    localStorage.setItem("forge-shortcuts", shortcuts ? "on" : "off");
  }, [shortcuts]);
  useEffect(() => {
    localStorage.setItem("hexari-forge-activity", JSON.stringify(activity));
  }, [activity]);
  useEffect(() => {
    if (opponent !== "online")
      localStorage.setItem("hexari-forge-chat", JSON.stringify(chat));
  }, [chat, opponent]);
  useEffect(() => {
    if (started || !sound) return;
    const player = welcomeMusicRef.current ?? startWelcomeMusic();
    welcomeMusicRef.current = player;
    return () => {
      player.stop();
      if (welcomeMusicRef.current === player) welcomeMusicRef.current = null;
    };
  }, [started, sound]);
  useResultAudio({
    started,
    sound,
    phase: game.phase,
    winner: game.winner,
    opponent,
    seat: online?.seat,
  });
  // Attempt playback inside the leave interaction before React paints the welcome screen.
  function startWelcomeOnReturn() {
    if (sound && !welcomeMusicRef.current)
      welcomeMusicRef.current = startWelcomeMusic();
  }
  function log(entry: string) {
    setActivity((previous) => [...previous, entry].slice(-100));
  }
  function toggleSound() {
    if (sound) stopSoundEffects();
    setSound(!sound);
  }
  function startNewGame(now = eventTime()) {
    clearLocalForgeCoachHistory();
    if (rollEffectTimer.current) clearTimeout(rollEffectTimer.current);
    setRollEffect(null);
    setResultDismissed(false);
    setResultCelebrated(false);
    const fresh = newGame(now, { manualSetup: true });
    cancelOpening();
    gameRef.current = fresh;
    setGame(fresh);
    setClock(now);
    setDiceFaces(null);
    setTarget(null);
    setBuildSelection(null);
    setActivity([]);
    setChat([]);
    setCoachGeneration((generation) => generation + 1);
    setMessage("");
  }
  const isBotTurn =
    opponent === "bot" && game.turn === 1 && game.phase !== "end";
  const botMustDiscard =
    opponent === "bot" &&
    game.phase === "discard" &&
    (game.discardRemaining?.[1] ?? 0) > 0;
  const botTurn =
    isBotTurn ||
    (opponent === "online" &&
      (!online?.connected || online.pending || online.seat !== game.turn));
  const discardSeat: Seat =
    opponent === "online"
      ? (online?.seat ?? 0)
      : opponent === "bot"
        ? 0
        : (game.discardRemaining?.[0] ?? 0) > 0
          ? 0
          : 1;
  const handPlayer =
    opponent === "online"
      ? (online?.seat ?? 0)
      : opponent === "bot"
        ? 0
        : game.phase === "discard"
          ? discardSeat
          : game.turn;
  const canDiscard =
    game.phase === "discard" &&
    (game.discardRemaining?.[discardSeat] ?? 0) > 0 &&
    (opponent !== "online" || (!!online?.connected && !online.pending));
  const robberTile = game.robberTile;
  const robberOrigin =
    robberTile ?? defaultBoard.findIndex((tile) => tile.resource === "desert");
  const canMoveRobber =
    game.phase === "robber" && !botTurn && pausedAt === null;
  const { show: showResourceMotion, overlay: resourceMotionOverlay } =
    useResourceMotion(handPlayer);
  const displayName = account.name ?? guestNickname;
  const playerNames: [string, string] =
    opponent === "hotseat"
      ? ["Player 1", "Player 2"]
      : opponent === "bot"
        ? [displayName, botNickname]
        : (online?.session.names ??
          (online?.seat === 1
            ? ["Opponent", displayName]
            : [displayName, "Opponent"]));
  const buildAvailability = useMemo(
    () =>
      buildKinds.map((building) => ({
        building,
        ...buildOptions(game, building),
      })),
    [game],
  );
  const selectedBuilding =
    buildSelection?.turnStarted === game.turnStarted &&
    buildAvailability.find(
      (option) => option.building === buildSelection.building,
    )?.available
      ? buildSelection.building
      : null;
  useEffect(() => {
    if (
      !started ||
      pausedAt !== null ||
      (!isBotTurn && !botMustDiscard) ||
      (game.phase === "discard" && !botMustDiscard)
    )
      return;
    const timer = setTimeout(() => {
      if (botMustDiscard) {
        const next = playBotDiscard(game);
        if (next !== game) {
          gameRef.current = next;
          setGame(next);
          setActivity((previous) =>
            [...previous, `${botNickname} (Bot) discarded cards.`].slice(-100),
          );
        }
        return;
      }
      const first = Math.floor(Math.random() * 6) + 1,
        second = Math.floor(Math.random() * 6) + 1;
      if (game.phase === "roll") {
        const total = first + second;
        setDiceFaces([first, second]);
        setDiceAnimation((n) => n + 1);
        showRollEffect(total);
        if (sound) soundCue("roll");
        const next = transition(game, { type: "roll", total });
        gameRef.current = next;
        setGame(next);
        const actions = [`Rolled ${total}`];
        setMessage(`${botNickname} (Bot): ${actions.join(". ")}.`);
        setActivity((previous) =>
          [
            ...previous,
            ...actions.map((action) => `${botNickname} (Bot): ${action}`),
          ].slice(-100),
        );
        return;
      }
      const botMovements: import("./resourceTransfers").ResourceTransfer[] = [];
      const result = playBotTurn(game, first + second, Date.now(), (action) => {
        botMovements.push(...transfersForAction(action));
      });
      setMessage(`${botNickname} (Bot): ${result.actions.join(". ")}.`);
      setActivity((previous) =>
        [
          ...previous,
          ...result.actions.map((action) => `${botNickname} (Bot): ${action}`),
        ].slice(-100),
      );
      const placement = placementSound(game, result.game);
      showResourceMotion(botMovements);
      if (sound && placement) soundCue(placement);
      if (
        sound &&
        result.game.phase !== "end" &&
        !placement &&
        result.actions.some((action) => action.startsWith("Traded"))
      )
        soundCue("trade");
      setGame(result.game);
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    started,
    isBotTurn,
    botMustDiscard,
    game,
    sound,
    pausedAt,
    showRollEffect,
    botNickname,
    showResourceMotion,
  ]);
  useEffect(() => {
    if (
      !started ||
      pausedAt !== null ||
      (opponent === "online" && !online?.connected)
    )
      return;
    const t = setInterval(() => {
      const now = Date.now();
      setClock(now);
      const current = gameRef.current;
      if (
        opponent !== "online" &&
        current.phase !== "end" &&
        now - current.turnStarted >= 120_000
      ) {
        if (sound) soundCue("timeout");
        const next = applyTurnTimeout(current, now);
        gameRef.current = next;
        setTarget(null);
        setMessage(
          current.phase === "setup"
            ? setupNeedsRoad(current)
              ? "Choose an edge for your starting road."
              : "Choose a starting corner."
            : current.phase === "discard"
              ? "Complete the required discards to continue."
              : current.phase === "robber"
                ? "Move the robber to continue."
                : current.progressed !== true &&
                    current.turn === 0 &&
                    current.phase === "roll"
                  ? "Roll the dice to begin."
                  : "Time is up. Pass the device to the next player.",
        );
        setActivity((previous) =>
          [
            ...previous,
            current.phase === "setup"
              ? setupNeedsRoad(current)
                ? "Waiting for the starting road."
                : "Waiting for the starting settlement."
              : current.phase === "discard"
                ? "Waiting for the required discards."
                : current.phase === "robber"
                  ? "Waiting for the robber to move."
                  : current.progressed !== true &&
                      current.turn === 0 &&
                      current.phase === "roll"
                    ? "Waiting for the first roll."
                    : `${opponent === "hotseat" ? `Player ${current.turn + 1}` : current.turn === 0 ? displayName : botNickname} ran out of time.`,
          ].slice(-100),
        );
        setGame(next);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [
    started,
    sound,
    pausedAt,
    opponent,
    online?.connected,
    displayName,
    botNickname,
  ]);
  const left = turnTimeRemaining(game, clock, pausedAt);
  function choose(
    id: number,
    to?: number,
    trigger?: SVGElement,
    suppressSelectSound = false,
  ) {
    if (botTurn || opening) return;
    if (game.phase === "setup") {
      const valid = setupNeedsRoad(game)
        ? to !== undefined && legalSetupRoad(game, id, to)
        : to === undefined && legalSetupSettlement(game, id);
      if (!valid) {
        if (sound) soundCue("blocked");
        setMessage(
          setupNeedsRoad(game)
            ? "Choose a highlighted edge for your starting road."
            : "Choose a highlighted starting corner.",
        );
        return;
      }
    } else if (game.phase !== "build") {
      if (sound) soundCue("error");
      setMessage("Roll before building.");
      return;
    }
    if (
      selectedBuilding &&
      (game.phase === "build" ||
        (game.phase === "setup" && setupNeedsRoad(game)))
    ) {
      const option = buildAvailability.find(
        (item) => item.building === selectedBuilding,
      )!;
      const valid =
        option.available &&
        (selectedBuilding === "road"
          ? option.edges.some(([a, b]) =>
              to === undefined
                ? a === id || b === id
                : (a === id && b === to) || (a === to && b === id),
            )
          : to === undefined && option.corners.includes(id));
      if (!valid) {
        if (sound) soundCue("blocked");
        setMessage("Choose a highlighted placement.");
        return;
      }
      if (selectedBuilding === "road" && to === undefined) return;
      build(selectedBuilding, id, to);
      return;
    }
    if (sound && !suppressSelectSound) soundCue("select");
    buildTrigger.current = trigger ?? null;
    setTarget({ at: id, to });
  }
  function closeBuildPopover(restoreFocus = true) {
    setTarget(null);
    if (restoreFocus && buildTrigger.current?.isConnected)
      buildTrigger.current.focus();
    buildTrigger.current = null;
  }
  function build(
    building: import("./engine").Building,
    at: number,
    to?: number,
  ) {
    if (botTurn || (game.phase !== "build" && game.phase !== "setup")) return;
    if (
      game.phase === "setup" &&
      (setupNeedsRoad(game)
        ? building !== "road" ||
          to === undefined ||
          !legalSetupRoad(game, at, to)
        : building !== "settlement" ||
          to !== undefined ||
          !legalSetupSettlement(game, at))
    )
      return;
    if (opponent === "online") {
      if (onlineCommand({ type: "build", building, at, to })) {
        setTarget(null);
        setMessage("Placing...");
      }
      return;
    }
    const now = eventTime();
    const next = transition(game, { type: "build", building, at, to, now });
    if (next === game) {
      const legal =
        building === "road"
          ? to !== undefined && legalRoad(game, at, to)
          : building === "settlement"
            ? legalSettlement(game, at)
            : building === "city"
              ? game.players[game.turn].settlements.includes(at)
              : true;
      if (sound) soundCue(legal ? "error" : "blocked");
      setMessage(
        "That build is not legal or you do not have the required resources.",
      );
    } else {
      showResourceMotion(
        transfersForAction({
          type: "build",
          actor: game.turn,
          building,
          setup: game.phase === "setup",
        }),
      );
      if (sound) {
        soundCue(building);
      }
      if (game.phase === "setup") {
        log(`${playerNames[game.turn]} placed a starting ${building}.`);
        setMessage(
          next.phase === "setup"
            ? setupNeedsRoad(next)
              ? "Choose an edge for your starting road."
              : "Choose a starting corner."
            : "Roll to begin your turn.",
        );
      } else {
        log(
          `${playerNames[game.turn]} built a ${building}${building === "road" ? "" : ` at corner ${at + 1}`}.`,
        );
        setMessage(
          `${building[0].toUpperCase() + building.slice(1)} built. Turn complete.`,
        );
      }
    }
    gameRef.current = next;
    setClock(now);
    setGame(next);
    setTarget(null);
  }
  function tradeWithBank(give: Goods, receive: Goods): boolean | "pending" {
    if (opponent === "online") {
      return onlineCommand({ type: "bank", give, receive }) ? "pending" : false;
    }
    const rate = 4;
    const next = transition(game, { type: "bank", give, receive });
    if (next === game) return false;
    showResourceMotion(
      transfersForAction({ type: "bank", actor: game.turn, give, receive }),
    );
    setGame(next);
    setMessage(`Traded ${rate} ${give} for one ${receive}.`);
    log(`${playerNames[game.turn]} traded ${rate} ${give} for 1 ${receive}.`);
    if (sound) soundCue("bank");
    return true;
  }
  function tradeWithPlayer(give: Goods, receive: Goods) {
    const next = transition(game, { type: "playerTrade", give, receive });
    if (next === game) return false;
    showResourceMotion(
      transfersForAction({
        type: "trade",
        actor: game.turn,
        other: 1 - game.turn,
        give,
        receive,
      }),
    );
    setGame(next);
    setMessage(`Traded one ${give} for one ${receive}.`);
    log(
      `${playerNames[game.turn]} traded 1 ${give} for 1 ${receive} with ${playerNames[1 - game.turn]}.`,
    );
    if (sound) soundCue("trade");
    return true;
  }
  function enterGame(resume: boolean) {
    setPixiReady(false);
    welcomeMusicRef.current?.stop();
    welcomeMusicRef.current = null;
    const now = eventTime();
    if (sound) soundCue("start");
    if (resume) {
      cancelOpening();
      const resumed = { ...game, turnStarted: now };
      gameRef.current = resumed;
      setGame(resumed);
    } else {
      startNewGame(now);
    }
    setClock(now);
    setStarted(true);
  }
  function openGameSelection() {
    try {
      const saved = parseResumableGame(localStorage.getItem(key));
      setHasSavedGame(saved !== null);
      if (saved) {
        gameRef.current = saved;
        setGame(saved);
      }
    } catch {
      setHasSavedGame(false);
    }
    setModeDialogOpen(true);
  }
  function pauseGame() {
    if (opponent === "online") {
      setMessage("Online games cannot be paused.");
      return;
    }
    if (pauseActive.current) return;
    pauseActive.current = true;
    const now = eventTime();
    setClock(now);
    setPausedAt(now);
    setTarget(null);
    setMenuOpen(false);
    setSettingsOpen(false);
    setPendingConfirmation(null);
    stopSoundEffects();
    log("Game paused.");
  }
  function resumeGame() {
    if (pausedAt === null) return;
    const now = eventTime();
    const resumed = {
      ...gameRef.current,
      turnStarted: gameRef.current.turnStarted + now - pausedAt,
    };
    gameRef.current = resumed;
    setGame(resumed);
    setClock(now);
    pauseActive.current = false;
    setPausedAt(null);
    log("Game resumed.");
  }
  function finishOnlineExit(findNew: boolean, keepCredentials = false) {
    setOpponentNotice(null);
    setPeerResumed(false);
    setStartNewOnline(findNew && keepCredentials);
    for (const pending of pendingChats.current.values()) {
      clearTimeout(pending.timer);
      pending.resolve(false);
    }
    pendingChats.current.clear();
    pendingOnlineExit.current = null;
    if (onlineRetry.current) clearTimeout(onlineRetry.current);
    cancelOnlineReconnect.current?.();
    cancelOnlineReconnect.current = null;
    if (onlineSocket.current) onlineSocket.current.onclose = null;
    onlineSocket.current?.close();
    onlineSocket.current = null;
    onlineRef.current = null;
    if (!keepCredentials) sessionStorage.removeItem(ONLINE_SESSION_KEY);
    if (!keepCredentials) lastChatAttempt.current = null;
    setOnline(null);
    setChat([]);
    setOpponent("bot");
    setStarted(false);
    setPausedAt(null);
    setMenuOpen(false);
    setOnlineLobby(findNew);
    stopSoundEffects();
    startWelcomeOnReturn();
  }
  function requestOnlineExit(findNew: boolean) {
    const socket = onlineSocket.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      if (onlineCredentials()) {
        setMessage("Resume the online game before leaving it.");
      } else finishOnlineExit(findNew);
      return;
    }
    pendingOnlineExit.current = findNew ? "match" : "welcome";
    try {
      socket.send(JSON.stringify({ type: "leave" }));
      if (onlineRef.current) {
        onlineRef.current = { ...onlineRef.current, pending: true };
        setOnline(onlineRef.current);
      }
      setMessage("Leaving game...");
    } catch {
      pendingOnlineExit.current = null;
      setMessage(
        "The online connection is unavailable. Resume the game before leaving it.",
      );
    }
  }
  function leaveGame() {
    if (opponent === "online") {
      requestOnlineExit(false);
      return;
    }
    const current = gameRef.current;
    try {
      const saved = JSON.stringify(current);
      localStorage.setItem(key, saved);
      setHasSavedGame(parseResumableGame(saved) !== null);
    } catch {
      setHasSavedGame(false);
    }
    setMenuOpen(false);
    pauseActive.current = false;
    setPausedAt(null);
    setStarted(false);
    stopSoundEffects();
    startWelcomeOnReturn();
  }
  function rollDice() {
    if (game.phase !== "roll" || botTurn || pausedAt !== null || opening)
      return;
    if (opponent === "online") {
      onlineCommand({ type: "roll" });
      return;
    }
    const first = eventDie(),
      second = eventDie();
    setDiceFaces([first, second]);
    setDiceAnimation((n) => n + 1);
    showRollEffect(first + second);
    if (sound) soundCue("roll");
    log(`${playerNames[game.turn]} rolled ${first + second}.`);
    setMessage("");
    const next = transition(game, { type: "roll", total: first + second });
    gameRef.current = next;
    setGame(next);
  }
  function discardForSeven(resource: Goods) {
    if (!canDiscard) return;
    if (opponent === "online") {
      onlineCommand({ type: "sevenDiscard", resource });
      return;
    }
    const next = transition(game, {
      type: "sevenDiscard",
      seat: discardSeat,
      resource,
    });
    if (next === game) return;
    gameRef.current = next;
    setGame(next);
    log(`${playerNames[discardSeat]} discarded a card.`);
    if (sound) soundCue("discard");
  }
  function moveRobber(tile: number) {
    if (game.phase !== "robber" || botTurn || pausedAt !== null) return;
    if (opponent === "online") {
      onlineCommand({ type: "moveRobber", tile });
      return;
    }
    const next = transition(game, { type: "moveRobber", tile });
    if (next === game) return;
    gameRef.current = next;
    setGame(next);
    setMessage("Robber moved.");
    log(`${playerNames[game.turn]} moved the robber.`);
    if (sound) soundCue("select");
  }
  function endTurn() {
    if (game.phase !== "build" || botTurn || pausedAt !== null) return;
    if (opponent === "online") {
      onlineCommand({ type: "endTurn" });
      return;
    }
    log(`${playerNames[game.turn]} ended their turn.`);
    if (sound) soundCue("turn");
    const next = transition(game, { type: "endTurn", now: eventTime() });
    gameRef.current = next;
    setGame(next);
    setTarget(null);
  }
  useEffect(() => {
    pauseHandler.current = pauseGame;
    keyHandler.current = (event) => {
      if (
        !started ||
        !shortcuts ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const key = event.key.toLowerCase();
      if (pausedAt !== null && key === "p") {
        event.preventDefault();
        resumeGame();
        return;
      }
      if (settingsOpen || pendingConfirmation || pausedAt !== null || menuOpen)
        return;
      const el = event.target;
      if (
        el instanceof HTMLElement &&
        (el.isContentEditable ||
          el.closest("input, textarea, select, [contenteditable='true']"))
      )
        return;
      if (
        key === " " &&
        el instanceof Element &&
        el.closest("button, a, [role='button']")
      )
        return;
      if (key === " " && game.phase !== "end" && !botTurn) {
        event.preventDefault();
        if (game.phase === "roll") rollDice();
        else endTurn();
      } else if (key === "p" && game.phase !== "end") {
        event.preventDefault();
        pauseGame();
      } else if (key === "m") {
        event.preventDefault();
        toggleSound();
      } else if (key === "arrowup" || key === "arrowdown") {
        event.preventDefault();
        setVolume(
          Math.max(0, Math.min(1, volume + (key === "arrowup" ? 0.1 : -0.1))),
        );
      } else if (key === "f") {
        event.preventDefault();
        if (document.fullscreenElement && document.exitFullscreen)
          void document.exitFullscreen().catch(() => {});
        else if (document.documentElement.requestFullscreen)
          void document.documentElement.requestFullscreen().catch(() => {});
      }
    };
  });
  useEffect(() => {
    if (!started || game.phase === "end" || opponent === "online") return;
    return watchFocusLoss(() => pauseHandler.current());
  }, [started, game.phase, opponent]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandler.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const confirmation = pendingConfirmation && (
    <ForgeConfirm
      online={opponent === "online" && pendingConfirmation === "restart"}
      changingOpponent={
        pendingConfirmation === "bot" || pendingConfirmation === "hotseat"
      }
      onCancel={() => setPendingConfirmation(null)}
      onConfirm={() => {
        const action = pendingConfirmation;
        setPendingConfirmation(null);
        if (action === "welcome-bot" || action === "welcome-hotseat") {
          setOpponent(action === "welcome-bot" ? "bot" : "hotseat");
          enterGame(false);
        } else if (action === "restart" && opponent === "online") {
          requestOnlineExit(true);
        } else {
          if (action === "bot" || action === "hotseat") setOpponent(action);
          startNewGame();
          if (sound) soundCue("start");
        }
      }}
    />
  );
  const pos = (x: number, y: number) => `${240 + x * 45},${185 + y * 45}`;
  if (!started) {
    return (
      <main className="forge-welcome">
        {onlineLobby && (
          <ForgeOnlineLobby
            startNew={startNewOnline}
            onClose={() => {
              setOnlineLobby(false);
              setStartNewOnline(false);
            }}
            onReady={enterOnline}
            onAccount={() => {
              returnToOnline.current = true;
              setOnlineLobby(false);
              setOpenAccount(true);
              setSettingsOpen(true);
            }}
          />
        )}
        {confirmation}
        {settingsOpen && (
          <ForgeSettings
            canReloadAfterConfirmation={canReloadAfterConfirmation}
            initialPage={accountCallback || openAccount ? "Account" : undefined}
            timerRunning={false}
            sound={sound}
            onSound={toggleSound}
            volume={volume}
            onVolume={setVolume}
            fontSize={fontSize}
            onFontSize={setFontSize}
            shortcuts={shortcuts}
            onShortcuts={setShortcuts}
            onClose={closeSettings}
          />
        )}
        {modeDialogOpen && (
          <ForgeModeDialog
            hasSavedGame={hasSavedGame}
            onClose={() => setModeDialogOpen(false)}
            onResume={() => {
              setModeDialogOpen(false);
              enterGame(true);
            }}
            onChoose={(mode) => {
              setModeDialogOpen(false);
              if (mode === "online") {
                setOnlineLobby(true);
                return;
              }
              if (hasSavedGame)
                setPendingConfirmation(
                  mode === "bot" ? "welcome-bot" : "welcome-hotseat",
                );
              else {
                setOpponent(mode);
                enterGame(false);
              }
            }}
          />
        )}
        <div className="forge-welcome-content">
          <div className="forge-welcome-brand">
            <BrandMark variant="forge" />
            <h1>forge</h1>
          </div>
          <p>Build your way to victory.</p>
          <div className="forge-welcome-actions">
            <button
              type="button"
              className="button primary"
              onClick={openGameSelection}
            >
              Start game
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => {
                if (window.history.length > 1) window.history.back();
                else
                  window.location.assign(
                    standalone
                      ? "about:blank"
                      : `${hexariHomeHref()}?from=forge`,
                  );
              }}
            >
              Leave game
            </button>
          </div>
          {!standalone && (
            <a href={`${hexariHomeHref()}?from=forge`}>Back to Hexari</a>
          )}
        </div>
      </main>
    );
  }
  return (
    <div
      className={`forge-page${opponent === "online" ? " forge-online" : ""}`}
      style={{ zoom: tableScale }}
    >
      {rollEffect &&
        createPortal(
          <div
            className="forge-roll-flights"
            aria-hidden="true"
            key={rollEffect.id}
          >
            {rollEffect.targets.map((target) => (
              <span
                key={target.id}
                className="forge-roll-flight"
                style={
                  {
                    left: rollEffect.start.x,
                    top: rollEffect.start.y,
                    "--roll-dx": `${target.x - rollEffect.start.x}px`,
                    "--roll-dy": `${target.y - rollEffect.start.y}px`,
                  } as CSSProperties
                }
              >
                {rollEffect.total}
              </span>
            ))}
          </div>,
          document.body,
        )}
      {confirmation}
      {resourceMotionOverlay}
      {peerResumed && started && opponent === "online" && (
        <div className="forge-peer-resumed" role="status">
          Your opponent has reconnected and resumed the game.
        </div>
      )}
      {opponentNotice &&
        createPortal(
          <ForgeOpponentLeftNotice
            disconnected={opponentNotice !== "left"}
            timedOut={opponentNotice === "recoverable"}
            busy={online?.pending === true}
            onReturn={() => {
              if (opponentNotice === "left") finishOnlineExit(false);
              else if (onlineSocket.current?.readyState === WebSocket.OPEN)
                requestOnlineExit(false);
              else finishOnlineExit(false, true);
            }}
            onFindGame={() => {
              if (opponentNotice === "left") finishOnlineExit(true);
              else if (onlineSocket.current?.readyState === WebSocket.OPEN)
                requestOnlineExit(true);
              else finishOnlineExit(true, true);
            }}
          />,
          document.body,
        )}
      {pausedAt !== null && (
        <ForgePause
          onResume={resumeGame}
          onLeave={leaveGame}
          remaining={left}
        />
      )}
      {game.phase === "end" && game.winner !== null && !resultDismissed && (
        <ForgeResult
          game={game}
          bot={opponent === "bot"}
          names={playerNames}
          celebrate={!resultCelebrated}
          localSeat={opponent === "online" ? online?.seat : undefined}
          onViewBoard={() => {
            setResultCelebrated(true);
            setResultDismissed(true);
          }}
          onMainMenu={() => {
            if (
              opponent === "online" &&
              onlineSocket.current?.readyState !== WebSocket.OPEN
            ) {
              finishOnlineExit(false);
              return;
            }
            leaveGame();
          }}
          onPlayAgain={() => {
            if (opponent === "online") {
              requestOnlineExit(true);
              return;
            }
            startNewGame();
            if (sound) soundCue("start");
          }}
        />
      )}
      {settingsOpen && (
        <ForgeSettings
          canReloadAfterConfirmation={canReloadAfterConfirmation}
          initialPage={accountCallback || openAccount ? "Account" : undefined}
          timerRunning={game.phase !== "end" && pausedAt === null}
          sound={sound}
          onSound={toggleSound}
          volume={volume}
          onVolume={setVolume}
          fontSize={fontSize}
          onFontSize={setFontSize}
          shortcuts={shortcuts}
          onShortcuts={setShortcuts}
          onClose={closeSettings}
        />
      )}
      <div className="forge-profile-controls">
        <ForgeFullscreen />
        <button
          type="button"
          className="forge-player-profile"
          aria-label={`${account.signedIn ? "Open account" : "Sign in or create account"}${opponent === "hotseat" ? "" : `, ${playerNames[handPlayer]}`}`}
          onClick={() => {
            setOpenAccount(true);
            setSettingsOpen(true);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20v-1a7 7 0 0 1 14 0v1H5Z" />
          </svg>
          <span>
            {opponent !== "hotseat" && (
              <strong>{playerNames[handPlayer]}</strong>
            )}
            <small>{account.signedIn ? "Account" : "Sign in"}</small>
          </span>
        </button>
      </div>
      <div className="forge-nav">
        <div className="opponent-switch" aria-label="Opponent">
          {opponent !== "online" &&
            (["bot", "hotseat"] as const).map((option) => (
              <button
                key={option}
                className={`button forge-mode-button ${opponent === option ? "primary" : "ghost"}`}
                type="button"
                aria-label={option === "bot" ? "Play bot" : "Two players"}
                title={option === "bot" ? "Play bot" : "Two players"}
                aria-pressed={opponent === option}
                onClick={() => {
                  if (opponent !== option) setPendingConfirmation(option);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  {option === "bot" ? (
                    <>
                      <rect x="4" y="7" width="16" height="12" rx="3" />
                      <path d="M12 7V4m-2 0h4M8 12h.01M16 12h.01M9 16h6M2 11v4m20-4v4" />
                    </>
                  ) : (
                    <>
                      <circle cx="9" cy="8" r="3" />
                      <path d="M3.5 19v-1a5.5 5.5 0 0 1 11 0v1H3.5ZM16 5.4a3 3 0 0 1 0 5.7m.2 2.5a4.5 4.5 0 0 1 4.3 4.5v.9h-3" />
                    </>
                  )}
                </svg>
              </button>
            ))}
          <button
            className="button ghost forge-mode-button forge-online-unavailable"
            type="button"
            aria-label="Online 1 vs. 1"
            title="Online 1 vs. 1"
            onClick={() => {
              if (opponent === "online") leaveGame();
              else {
                setStarted(false);
                setOnlineLobby(true);
              }
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
            </svg>
          </button>
        </div>
        <ForgeGuide />
        <button
          className="button ghost forge-settings-toggle"
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={() => {
            setMenuOpen(false);
            setSettingsOpen(true);
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path
              d="M10 2h4l.6 2.2 1.7.7 2-1.2 2 2-1.2 2 .7 1.7L22 10v4l-2.2.6-.7 1.7 1.2 2-2 2-2-1.2-1.7.7L14 22h-4l-.6-2.2-1.7-.7-2 1.2-2-2 1.2-2-.7-1.7L2 14v-4l2.2-.6.7-1.7-1.2-2 2-2 2 1.2 1.7-.7L10 2Z"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        <div className="forge-game-menu">
          <button
            className="button ghost forge-restart"
            type="button"
            aria-label="Game options"
            title="Game options"
            aria-expanded={menuOpen}
            aria-controls="forge-game-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path
                d="M7 8h10a4 4 0 0 1 4 4v3a2 2 0 0 1-3.4 1.4L15 14H9l-2.6 2.4A2 2 0 0 1 3 15v-3a4 4 0 0 1 4-4Z"
                strokeLinejoin="round"
              />
              <path d="M7 11v4m-2-2h4m6-1h.01m3 2h.01" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      {menuOpen && (
        <ForgeGameMenu
          finished={game.phase === "end"}
          onClose={() => setMenuOpen(false)}
          onNewGame={() => {
            setMenuOpen(false);
            setPendingConfirmation("restart");
          }}
          onPause={() => {
            setMenuOpen(false);
            pauseGame();
          }}
          onLeave={() => {
            setMenuOpen(false);
            leaveGame();
          }}
        />
      )}
      <div className="forge-layout">
        <div className="forge-board-area">
          <h1 className="sr-only">Forge</h1>
          <div className="panel forge-board">
            <div
              className={`board-canvas-stack ${pixiReady ? "pixi-ready" : ""}`}
            >
              <PixiTerrain
                board={defaultBoard}
                geometry={forgeGeometry}
                selected={null}
                onReady={setPixiReady}
              />
              <svg
                ref={boardSvgRef}
                viewBox="5 -10 470 390"
                role="group"
                aria-label="Forge game board"
              >
                <defs>
                  <linearGradient
                    id="forge-tile-light"
                    x1="0"
                    y1="0"
                    x2="0.4"
                    y2="1"
                  >
                    <stop offset="0" stopColor="#fff3cb" stopOpacity=".25" />
                    <stop offset=".55" stopColor="#fff3cb" stopOpacity=".03" />
                    <stop offset="1" stopColor="#142d28" stopOpacity=".32" />
                  </linearGradient>
                  <linearGradient
                    id="forge-token-face"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0" stopColor="#fff9e6" />
                    <stop offset="1" stopColor="#dfc99c" />
                  </linearGradient>
                </defs>
                {centers.map((c, i) => {
                  const t = defaultBoard[i],
                    pts = Array.from({ length: 6 }, (_, j) => {
                      const a = ((60 * j - 30) * Math.PI) / 180;
                      return pos(
                        c.x + Math.cos(a) * 0.96,
                        c.y + Math.sin(a) * 0.96,
                      );
                    }).join(" ");
                  return (
                    <g key={i} data-forge-tile={i}>
                      <polygon
                        className="terrain-fill"
                        points={pts}
                        fill={terrain[t.resource]}
                        stroke="#192828"
                        strokeWidth="2"
                      />
                      <polygon
                        points={pts}
                        fill="url(#forge-tile-light)"
                        stroke="#f1dfb4"
                        strokeOpacity=".38"
                        strokeWidth="2"
                        pointerEvents="none"
                      />
                      {rollEffect?.targets.some(
                        (target) => target.id === i,
                      ) && (
                        <polygon
                          key={rollEffect.id}
                          className="forge-roll-highlight"
                          points={pts}
                          pointerEvents="none"
                        />
                      )}
                      <polygon
                        points={[1, 2, 3, 3, 2, 1]
                          .map((corner, index) => {
                            const angle = ((60 * corner - 30) * Math.PI) / 180;
                            return `${240 + (c.x + Math.cos(angle) * 0.96) * 45},${185 + (c.y + Math.sin(angle) * 0.96) * 45 - (index >= 3 ? 3 : 0)}`;
                          })
                          .join(" ")}
                        fill="#102d27"
                        opacity=".28"
                        pointerEvents="none"
                      />
                      <polygon
                        points={Array.from({ length: 6 }, (_, j) => {
                          const a = ((60 * j - 30) * Math.PI) / 180;
                          return pos(
                            c.x + Math.cos(a) * 0.85,
                            c.y + Math.sin(a) * 0.85,
                          );
                        }).join(" ")}
                        fill="none"
                        stroke="#fff0c8"
                        strokeOpacity=".25"
                        strokeWidth="1"
                        pointerEvents="none"
                      />
                      <g
                        className="forge-terrain-art"
                        transform={`translate(${240 + c.x * 45} ${185 + c.y * 45 - 12}) scale(0.9)`}
                        aria-label={`${t.resource} terrain`}
                      >
                        <TerrainArt resource={t.resource} />
                      </g>
                      {t.number && (
                        <g
                          transform={`translate(${240 + c.x * 45} ${197 + c.y * 45}) scale(0.9) translate(${-240 - c.x * 45} ${-197 - c.y * 45})`}
                        >
                          <circle
                            cx={240 + c.x * 45}
                            cy={185 + c.y * 45 + 14}
                            r="14"
                            fill="#2d4439"
                            opacity=".3"
                          />
                          <circle
                            cx={240 + c.x * 45}
                            cy={185 + c.y * 45 + 12}
                            r="13"
                            fill="url(#forge-token-face)"
                            stroke="#9c895e"
                            strokeWidth="1"
                          />
                          <path
                            d={`M${233 + c.x * 45} ${191 + c.y * 45} q7 -5 14 0`}
                            fill="none"
                            stroke="#fffdf1"
                            strokeOpacity=".6"
                            strokeWidth="1"
                            pointerEvents="none"
                          />
                          <text
                            x={240 + c.x * 45}
                            y={189 + c.y * 45 + 12}
                            textAnchor="middle"
                            className="number"
                          >
                            {t.number}
                          </text>
                        </g>
                      )}
                      {i === robberTile && (
                        <g
                          transform={`translate(${240 + c.x * 45 + 20} ${185 + c.y * 45 - 3}) scale(0.9)`}
                          aria-label="Robber"
                          pointerEvents="none"
                        >
                          <ellipse
                            cy="11"
                            rx="9"
                            ry="3"
                            fill="#152b2d"
                            opacity=".35"
                          />
                          <path
                            d="M-7 10v-2c0-1.4 1-2.5 2.6-2.8L-2-2h4l2.4 7.2C6 5.5 7 6.6 7 8v2Z"
                            fill="#304640"
                            stroke="#e7d7ad"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M-4.4 5.2h8.8M-7 8.4H7"
                            fill="none"
                            stroke="#91aa9c"
                            strokeWidth="1.2"
                          />
                          <circle
                            cy="-5"
                            r="4.5"
                            fill="#415b51"
                            stroke="#e7d7ad"
                            strokeWidth="1.5"
                          />
                          <path
                            d="M-2.5-6.4a2.6 2.6 0 0 1 2-1.2"
                            fill="none"
                            stroke="#c1d1bf"
                            strokeLinecap="round"
                            strokeWidth="1"
                          />
                        </g>
                      )}
                      {canMoveRobber && i !== robberOrigin && (
                        <polygon
                          points={pts}
                          className="forge-robber-target"
                          role="button"
                          tabIndex={0}
                          aria-label={`Move robber to ${t.resource} tile ${i + 1}`}
                          onClick={() => moveRobber(i)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              moveRobber(i);
                            }
                          }}
                        />
                      )}
                    </g>
                  );
                })}
                {game.players.flatMap((p, i) =>
                  p.roads.map(([a, b]) => (
                    <g
                      key={`${i}-${a}-${b}`}
                      className={
                        animatedPlacements.has(roadPlacementKey(i, a, b))
                          ? "forge-piece-landing forge-road-landing"
                          : undefined
                      }
                      strokeLinecap="round"
                      pointerEvents="none"
                    >
                      <line
                        x1={240 + vertices[a].x * 45}
                        y1={187 + vertices[a].y * 45}
                        x2={240 + vertices[b].x * 45}
                        y2={187 + vertices[b].y * 45}
                        stroke="#263d39"
                        strokeWidth="8"
                      />
                      <line
                        x1={240 + vertices[a].x * 45}
                        y1={185 + vertices[a].y * 45}
                        x2={240 + vertices[b].x * 45}
                        y2={185 + vertices[b].y * 45}
                        stroke={i ? "#80b9d4" : "#f1c36b"}
                        strokeWidth="6"
                      />
                      <line
                        x1={240 + vertices[a].x * 45}
                        y1={184 + vertices[a].y * 45}
                        x2={240 + vertices[b].x * 45}
                        y2={184 + vertices[b].y * 45}
                        stroke={i ? "#c5eef4" : "#ffe0a0"}
                        strokeWidth="1.4"
                      />
                    </g>
                  )),
                )}
                {(game.phase === "build" ||
                  (game.phase === "setup" && setupNeedsRoad(game))) &&
                  !botTurn &&
                  (!selectedBuilding || selectedBuilding === "road") &&
                  buildAvailability.find((item) => item.building === "road")
                    ?.available &&
                  vertices.flatMap((v) =>
                    v.neighbors
                      .filter(
                        (id) =>
                          id > v.id &&
                          (game.phase === "setup"
                            ? legalSetupRoad(game, v.id, id)
                            : legalRoad(game, v.id, id)),
                      )
                      .map((id) => {
                        const other = vertices[id];
                        return (
                          <g key={`option-${v.id}-${id}`}>
                            <circle
                              className="forge-placement-halo"
                              cx={240 + ((v.x + other.x) / 2) * 45}
                              cy={185 + ((v.y + other.y) / 2) * 45}
                              r="9"
                              pointerEvents="none"
                            />
                            <line
                              className="forge-road-option"
                              pointerEvents="none"
                              x1={240 + v.x * 45}
                              y1={185 + v.y * 45}
                              x2={240 + other.x * 45}
                              y2={185 + other.y * 45}
                            />
                            <line
                              className="forge-road-hit"
                              x1={240 + v.x * 45}
                              y1={185 + v.y * 45}
                              x2={240 + other.x * 45}
                              y2={185 + other.y * 45}
                              role="button"
                              tabIndex={0}
                              aria-label={`Select edge between corners ${v.id + 1} and ${id + 1}`}
                              onClick={(event) =>
                                choose(v.id, id, event.currentTarget)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  choose(v.id, id, e.currentTarget);
                                }
                              }}
                            />
                          </g>
                        );
                      }),
                  )}
                {vertices.map((v) => {
                  const owner = game.players.findIndex(
                    (p) =>
                      p.settlements.includes(v.id) || p.cities.includes(v.id),
                  );
                  const city =
                    owner >= 0 && game.players[owner].cities.includes(v.id);
                  const openingPiece =
                    owner >= 0 &&
                    !city &&
                    opening?.keys.has(`settlement:${owner}:${v.id}`);
                  const openingHidden =
                    openingPiece && opening?.phase === "waiting";
                  const openingLanding =
                    openingPiece && opening?.phase === "landing";
                  const selectCorner = (trigger: SVGElement) => {
                    if (opening) return;
                    if (owner < 0) {
                      choose(v.id, undefined, trigger);
                      return;
                    }
                    if (sound)
                      soundCue(city ? "citySelect" : "settlementSelect");
                    if (botTurn || owner !== game.turn) return;
                    if (game.phase === "roll") {
                      buildTrigger.current = trigger;
                      setTarget({ at: v.id });
                      return;
                    }
                    if (game.phase !== "build") return;
                    if (selectedBuilding) {
                      const option = buildAvailability.find(
                        (item) => item.building === selectedBuilding,
                      );
                      const valid =
                        option?.available &&
                        (selectedBuilding === "road"
                          ? option.edges.some(
                              ([a, b]) => a === v.id || b === v.id,
                            )
                          : option.corners.includes(v.id));
                      if (!valid) return;
                    }
                    choose(v.id, undefined, trigger, true);
                  };
                  const available =
                    !botTurn &&
                    (game.phase === "setup"
                      ? legalSetupSettlement(game, v.id)
                      : buildAvailability.some(
                          (option) =>
                            option.available &&
                            (!selectedBuilding ||
                              selectedBuilding === option.building) &&
                            option.corners.includes(v.id),
                        ));
                  return (
                    <g key={v.id}>
                      {available && (
                        <circle
                          className="forge-placement-halo"
                          cx={240 + v.x * 45}
                          cy={185 + v.y * 45}
                          r="9"
                          pointerEvents="none"
                        />
                      )}
                      <circle
                        cx={240 + v.x * 45}
                        cy={185 + v.y * 45}
                        r={owner >= 0 && !openingHidden ? (city ? 9 : 7) : 5}
                        fill={
                          openingHidden
                            ? "#50605b"
                            : owner === 0
                              ? "#f1c36b"
                              : owner === 1
                                ? "#80b9d4"
                                : available
                                  ? "#e6eee0"
                                  : "#50605b"
                        }
                        stroke={
                          target?.at === v.id
                            ? "white"
                            : available
                              ? "#ffe4a2"
                              : "#24322f"
                        }
                        strokeWidth={available ? "3" : "2"}
                        role="button"
                        tabIndex={0}
                        aria-label={`Corner ${v.id + 1}${owner >= 0 && !openingHidden ? `, player ${owner + 1} ${city ? "city" : "settlement"}` : game.phase === "setup" && available ? ", available starting location" : ""}`}
                        onClick={(event) => selectCorner(event.currentTarget)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectCorner(e.currentTarget);
                          }
                        }}
                      />
                      {owner >= 0 && !openingHidden && (
                        <g
                          pointerEvents="none"
                          transform={`translate(${240 + v.x * 45} ${185 + v.y * 45}) scale(1.3)`}
                        >
                          <g
                            className={
                              openingLanding
                                ? "forge-opening-landing"
                                : animatedPlacements.has(
                                      `${city ? "city" : "settlement"}:${owner}:${v.id}`,
                                    )
                                  ? `forge-piece-landing forge-${city ? "city" : "settlement"}-landing`
                                  : undefined
                            }
                          >
                            <BuildingArt city={city} owner={owner} />
                          </g>
                        </g>
                      )}
                      {owner >= 0 && !openingHidden && (
                        <ellipse
                          cx={240 + v.x * 45}
                          cy={182 + v.y * 45}
                          rx="13"
                          ry={city ? 17 : 14}
                          fill="transparent"
                          aria-hidden="true"
                          onClick={(event) => {
                            const corner =
                              event.currentTarget.parentElement?.querySelector<SVGCircleElement>(
                                'circle[role="button"]',
                              );
                            selectCorner(corner ?? event.currentTarget);
                          }}
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
              {target &&
                (game.phase === "roll" ||
                  game.phase === "build" ||
                  game.phase === "setup") &&
                !botTurn && (
                  <ForgeBuildPopover
                    game={game}
                    target={target}
                    onBuild={build}
                    onClose={closeBuildPopover}
                    selectedBuilding={selectedBuilding}
                  />
                )}
            </div>
          </div>
        </div>
        <div className="forge-side">
          <div className="panel forge-controls">
            <div className="section-kicker">CURRENT TURN</div>
            <div className="turn-header">
              <h2>
                {turnLabel(
                  opponent,
                  handPlayer,
                  game.phase === "end" ? (game.winner ?? game.turn) : game.turn,
                  game.phase === "end",
                )}
              </h2>
              <strong>
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
              </strong>
            </div>
            <p>
              {game.phase === "setup"
                ? botTurn
                  ? "Waiting for the other player's starting placement."
                  : setupNeedsRoad(game)
                    ? "Choose a highlighted edge for your starting road."
                    : "Choose a highlighted corner for your first settlement."
                : game.phase === "roll"
                  ? "Roll to begin your turn."
                  : game.phase === "discard"
                    ? canDiscard
                      ? `${playerNames[discardSeat]}: discard ${game.discardRemaining?.[discardSeat]} card${game.discardRemaining?.[discardSeat] === 1 ? "" : "s"}.`
                      : "Waiting for the required discards."
                    : game.phase === "robber"
                      ? canMoveRobber
                        ? "Choose a different hex for the robber."
                        : "Waiting for the other player to move the robber."
                      : game.phase === "build"
                        ? "Build, trade, or end your turn."
                        : "Start a new game to play again."}
            </p>
            {game.phase === "end" && resultDismissed && (
              <button
                type="button"
                className="button ghost forge-show-result"
                onClick={() => setResultDismissed(false)}
              >
                View result
              </button>
            )}
            <div className="scoreboard">
              {game.players.map((_, i) => (
                <div key={i} data-forge-seat={i}>
                  <ForgeScoreName name={playerNames[i]} />
                  <small className="forge-score-status">
                    {[
                      opponent === "bot" && i === 1 ? "BOT" : "",
                      opponent !== "hotseat" && i === handPlayer ? "YOU" : "",
                      game.phase !== "end" && game.turn === i ? "TURN" : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "\u00a0"}
                  </small>
                  <strong>
                    {totalPoints(game, i as 0 | 1)} <small>/ 5 VP</small>
                  </strong>
                  {longestRoadOwner(game) === i && (
                    <small>Longest road +2</small>
                  )}
                </div>
              ))}
            </div>
            {game.phase !== "end" && (
              <>
                {game.phase === "discard" && canDiscard && (
                  <section
                    className="forge-discard-card"
                    aria-labelledby="forge-seven-discard-heading"
                  >
                    <h3 id="forge-seven-discard-heading">
                      Choose cards to discard
                    </h3>
                    <p className="hint" role="status">
                      {playerNames[discardSeat]}:{" "}
                      {game.discardRemaining?.[discardSeat]} remaining
                    </p>
                    <div
                      className="forge-discard-options"
                      role="group"
                      aria-label="Required discards"
                    >
                      {goods.map((resource) => (
                        <button
                          key={resource}
                          type="button"
                          className={`forge-bank-card forge-bank-${resource}`}
                          disabled={
                            game.players[discardSeat].hand[resource] < 1 ||
                            pausedAt !== null
                          }
                          aria-label={`Discard one ${resource}`}
                          onClick={() => discardForSeven(resource)}
                        >
                          <svg viewBox="-20 -20 40 40" aria-hidden="true">
                            <TerrainArt resource={resource} />
                          </svg>
                          <span className="forge-bank-count" aria-hidden="true">
                            -1
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {(game.phase === "setup" ||
                  game.phase === "roll" ||
                  game.phase === "build") && (
                  <fieldset className="forge-action-group" disabled={botTurn}>
                    <div className="field-label">BUILD</div>
                    <p role="status" className="hint">
                      {message}
                    </p>
                    <p className="hint">
                      {game.phase === "setup"
                        ? setupNeedsRoad(game)
                          ? "Place your starting road beside your settlement."
                          : "Choose a corner, then confirm your settlement."
                        : "Select an edge or corner to build. A build ends your turn."}
                    </p>
                    {game.phase === "build" &&
                      !botTurn &&
                      !buildAvailability.some((option) => option.available) && (
                        <p className="hint" role="status">
                          No build available yet. Trade or end your turn to
                          collect more resources.
                        </p>
                      )}
                    <section
                      className="forge-discard-card"
                      aria-labelledby="forge-discard-heading"
                    >
                      <h3 id="forge-discard-heading">Discard a card</h3>
                      <div
                        className="forge-discard-options"
                        role="group"
                        aria-label="Discard one resource"
                      >
                        {goods.map((resource) => (
                          <button
                            key={resource}
                            type="button"
                            className={`forge-bank-card forge-bank-${resource}`}
                            disabled={
                              game.phase !== "build" ||
                              game.players[game.turn].hand[resource] < 1
                            }
                            aria-label={`Discard one ${resource}`}
                            title={`Discard one ${resource}`}
                            onClick={() => {
                              if (opponent === "online") {
                                onlineCommand({ type: "discard", resource });
                                return;
                              }
                              const next = transition(game, {
                                type: "discard",
                                resource,
                              });
                              if (next !== game) {
                                setGame(next);
                                setMessage(`Discarded one ${resource}.`);
                                log(
                                  `${playerNames[game.turn]} discarded one ${resource}.`,
                                );
                                if (sound) soundCue("discard");
                              }
                            }}
                          >
                            <svg viewBox="-20 -20 40 40" aria-hidden="true">
                              <TerrainArt resource={resource} />
                            </svg>
                            <span
                              className="forge-bank-count"
                              aria-hidden="true"
                            >
                              −1
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  </fieldset>
                )}
                {opponent === "online" && online?.recoverable && (
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => finishOnlineExit(true, true)}
                  >
                    Resume online game
                  </button>
                )}
              </>
            )}
          </div>
          <section className="forge-table-panel" aria-label="Coach and table">
            {game.phase !== "end" && (
              <fieldset
                className="forge-action-group forge-table-market"
                disabled={botTurn}
              >
                <ForgeMarket
                  key={`${opponent}-${game.turnStarted}-${game.turn}`}
                  game={game}
                  bot={opponent === "bot"}
                  hideTrade={opponent === "online"}
                  bankPending={
                    opponent === "online" &&
                    (!online?.connected || online.pending)
                  }
                  onBank={tradeWithBank}
                  onTrade={tradeWithPlayer}
                  onCue={(cue: Cue) => {
                    if (sound) soundCue(cue);
                  }}
                />
              </fieldset>
            )}
            {opponent === "online" && online && (
              <ForgeOnlineTrade
                game={game}
                seat={online.seat}
                offer={online.session.offer}
                disabled={!online.connected || online.pending}
                onCommand={onlineCommand}
              />
            )}
            <ForgeCoach
              key={coachGeneration}
              game={game}
              botTurn={botTurn}
              onlineRoom={
                opponent === "online"
                  ? (onlineCredentials()?.room ?? "unavailable")
                  : null
              }
            />
            <ForgeActivity
              activity={activity}
              chat={chat}
              setChat={setChat}
              bot={opponent === "bot"}
              player={game.turn + 1}
              setup={game.phase === "setup"}
              showChat={opponent === "online"}
              chatConnected={!!online?.connected}
              onSendChat={opponent === "online" ? sendOnlineChat : undefined}
              onReportChat={
                opponent === "online"
                  ? (id) => {
                      sendOnlineEvent({ type: "report", id });
                    }
                  : undefined
              }
              onMessage={() => {
                if (sound) soundCue("message");
              }}
            />
          </section>
        </div>
        {game.phase !== "end" && (
          <fieldset
            className="forge-hand-dock forge-action-group"
            disabled={botTurn}
            aria-label="Turn actions and resources"
          >
            <div className="forge-turn-actions">
              <button
                type="button"
                className="dice-roll-control"
                disabled={game.phase !== "roll" || opening !== null}
                aria-label={
                  opening
                    ? "Placing starting settlements"
                    : game.phase === "setup"
                      ? "Complete your starting placements first"
                      : game.phase === "roll"
                        ? "Roll dice"
                        : `Dice rolled ${game.dice ?? ""}`
                }
                onClick={rollDice}
              >
                <span
                  className="dice-display"
                  ref={diceDisplayRef}
                  aria-hidden="true"
                >
                  {(diceFaces ?? (game.dice ? [0, 0] : [1, 6])).map(
                    (face, index) => (
                      <Die face={face} key={`${diceAnimation}-${index}`} />
                    ),
                  )}
                </span>
                <span className="dice-roll-hint">
                  {game.phase === "setup"
                    ? setupNeedsRoad(game)
                      ? "Place your road"
                      : "Place your settlement"
                    : game.phase === "roll" &&
                        !botTurn &&
                        !opening &&
                        pausedAt === null
                      ? "Tap the dice to roll"
                      : game.phase === "build"
                        ? `Rolled ${game.dice}`
                        : null}
                </span>
              </button>
              <ForgeBuildCards
                game={game}
                botTurn={botTurn}
                playerSeat={handPlayer}
                selected={selectedBuilding}
                onSelect={(building) => {
                  setBuildSelection(
                    selectedBuilding === building
                      ? null
                      : { building, turnStarted: game.turnStarted },
                  );
                  setTarget(null);
                  if (sound) soundCue("select");
                }}
              />
              <button
                type="button"
                className="forge-end-turn"
                aria-label="End turn"
                title="End turn"
                disabled={game.phase !== "build"}
                onClick={endTurn}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M4 12h13m-5-5 5 5-5 5m8-10v10"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            <div className="forge-hand-cards">
              <span className="forge-hand-label">Your hand</span>
              <div className="hand">
                {goods.map((g) => (
                  <div key={g}>
                    <button
                      className="forge-resource-card"
                      type="button"
                      aria-label={`${g}: ${game.players[handPlayer].hand[g]} cards`}
                      onClick={() => {
                        if (sound) soundCue(g);
                      }}
                    >
                      <svg viewBox="-20 -20 40 40" aria-hidden="true">
                        <TerrainArt resource={g} />
                      </svg>
                      <span>{g}</span>
                      <strong>{game.players[handPlayer].hand[g]}</strong>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </fieldset>
        )}
      </div>
    </div>
  );
}
