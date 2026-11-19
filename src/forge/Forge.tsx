import { initialTheme } from "../shared/ThemeToggle";
import "./forge.css";
import PixiTerrain from "../shared/PixiLayer";
import { playBotTurn } from "./bot";
import {
  soundCue,
  scheduleSoundCue,
  setMasterVolume,
  startWelcomeMusic,
  stopSoundEffects,
  type Cue,
  type WelcomeMusicPlayer,
} from "./sound";
import { BuildingArt, TerrainArt } from "../shared/TerrainArt";
import ForgeActivity, { type ChatMessage } from "./ForgeActivity";
import ForgeGuide from "./ForgeGuide";
import ForgeCoach from "./ForgeCoach";
import Die from "./Die";
import ForgeMarket from "./ForgeMarket";
import ForgeConfirm from "./ForgeConfirm";
import ForgeModeDialog from "./ForgeModeDialog";
import ForgeOnlineLobby, { type OnlineConnection } from "./ForgeOnlineLobby";
import ForgeOnlineTrade from "./ForgeOnlineTrade";
import type { OnlineCommand, OnlineSession, Seat } from "./online/session";
import { FONT_SIZE_KEY, readFontSize } from "./fontSize";
import ForgeSettings from "./ForgeSettings";
import ForgePause from "./ForgePause";
import ForgeResult from "./ForgeResult";
import ForgeBuildPopover from "./ForgeBuildPopover";
import ForgeBuildCards from "./ForgeBuildCards";
import { buildKinds, buildOptions } from "./buildOptions";
import { parseResumableGame } from "./savedGame";
import { watchFocusLoss } from "./focusPause";
import { applyTurnTimeout } from "./turnTimeout";
import { matchingRollTiles } from "./rollHighlight";
import BrandMark from "../shared/BrandMark";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { centers, defaultBoard, vertices } from "./board";
const forgeGeometry = { centers, x: -80, y: -80, width: 640, height: 530 };
import {
  goods,
  legalRoad,
  legalSettlement,
  newGame,
  points,
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
    return parseResumableGame(localStorage.getItem(key)) ?? newGame();
  } catch {
    /* start fresh */
  }
  return newGame();
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
    [settingsOpen, setSettingsOpen] = useState(false),
    [resultDismissed, setResultDismissed] = useState(false),
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
  const [onlineLobby, setOnlineLobby] = useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).has("forge-room"),
  );
  const [online, setOnline] = useState<{
    seat: Seat;
    session: OnlineSession;
    connected: boolean;
    pending: boolean;
  } | null>(null);
  const onlineSocket = useRef<WebSocket | null>(null);
  const onlineRef = useRef(online);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);
  useEffect(() => () => onlineSocket.current?.close(), []);
  function onlineCommand(command: OnlineCommand) {
    const current = onlineRef.current;
    if (
      !current ||
      !current.connected ||
      current.pending ||
      !onlineSocket.current ||
      onlineSocket.current.readyState !== WebSocket.OPEN
    )
      return;
    onlineRef.current = { ...current, pending: true };
    setOnline(onlineRef.current);
    onlineSocket.current.send(
      JSON.stringify({
        type: "command",
        revision: current.session.revision,
        command,
      }),
    );
  }
  const gameRef = useRef(game);
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
    const { socket, seat, session } = connection;
    onlineSocket.current = socket;
    const current = { seat, session, connected: true, pending: false };
    onlineRef.current = current;
    setOnline(current);
    setOpponent("online");
    setGame(session.game);
    setResultDismissed(false);
    setDiceFaces(null);
    setTarget(null);
    setBuildSelection(null);
    setActivity([]);
    setMessage("");
    gameRef.current = session.game;
    setStarted(true);
    setOnlineLobby(false);
    setModeDialogOpen(false);
    welcomeMusicRef.current?.stop();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));
        if (data.type === "state") {
          const previous = onlineRef.current;
          if (!previous) return;
          const updated = {
            ...previous,
            session: data.session as OnlineSession,
            pending: false,
          };
          onlineRef.current = updated;
          setOnline(updated);
          gameRef.current = updated.session.game;
          setGame(updated.session.game);
          setClock(Date.now());
          setTarget(null);
          if (Array.isArray(data.dice) && data.dice.length === 2) {
            setDiceFaces([data.dice[0], data.dice[1]]);
            setDiceAnimation((n) => n + 1);
          }
        } else if (data.type === "error") {
          setMessage(String(data.reason));
          setOnline((previous) =>
            previous ? { ...previous, pending: false } : null,
          );
          if (onlineRef.current)
            onlineRef.current = { ...onlineRef.current, pending: false };
        } else if (data.type === "closed") setMessage(String(data.reason));
      } catch {
        setMessage("The multiplayer server sent an invalid response.");
      }
    };
    socket.onclose = () => {
      setMessage(
        "The multiplayer connection closed. Return to the start screen to play again.",
      );
      setOnline((previous) =>
        previous ? { ...previous, connected: false, pending: false } : null,
      );
      if (onlineRef.current)
        onlineRef.current = {
          ...onlineRef.current,
          connected: false,
          pending: false,
        };
    };
    socket.onerror = () => setMessage("The multiplayer connection failed.");
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
    localStorage.setItem("hexari-forge-chat", JSON.stringify(chat));
  }, [chat]);
  useEffect(() => {
    if (started || !sound) return;
    const player = welcomeMusicRef.current ?? startWelcomeMusic();
    welcomeMusicRef.current = player;
    return () => {
      player.stop();
      if (welcomeMusicRef.current === player) welcomeMusicRef.current = null;
    };
  }, [started, sound]);
  function log(entry: string) {
    setActivity((previous) => [...previous, entry].slice(-100));
  }
  function toggleSound() {
    if (sound) stopSoundEffects();
    setSound(!sound);
  }
  function startNewGame(now = Date.now()) {
    if (rollEffectTimer.current) clearTimeout(rollEffectTimer.current);
    setRollEffect(null);
    setResultDismissed(false);
    const fresh = newGame(now);
    gameRef.current = fresh;
    setGame(fresh);
    setClock(now);
    setDiceFaces(null);
    setTarget(null);
    setBuildSelection(null);
    setActivity([]);
    setChat([]);
    setMessage("");
  }
  const isBotTurn =
    opponent === "bot" && game.turn === 1 && game.phase !== "end";
  const botTurn =
    isBotTurn ||
    (opponent === "online" &&
      (!online?.connected || online.pending || online.seat !== game.turn));
  const handPlayer =
    opponent === "online"
      ? (online?.seat ?? 0)
      : opponent === "bot"
        ? 0
        : game.turn;
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
    if (!started || !isBotTurn || pausedAt !== null) return;
    const timer = setTimeout(() => {
      const first = Math.floor(Math.random() * 6) + 1,
        second = Math.floor(Math.random() * 6) + 1;
      const result = playBotTurn(game, first + second, Date.now());
      const playBotCue = (cue: Cue) => {
        if (!sound) return;
        if (game.phase === "roll") scheduleSoundCue(cue, 500);
        else soundCue(cue);
      };
      if (game.phase === "roll") {
        setDiceFaces([first, second]);
        setDiceAnimation((n) => n + 1);
        showRollEffect(first + second);
        if (sound) soundCue("roll");
      }
      setMessage(`Bot: ${result.actions.join(". ")}.`);
      setActivity((previous) =>
        [
          ...previous,
          ...result.actions.map((action) => `Bot: ${action}`),
        ].slice(-100),
      );
      if (sound && result.game.phase === "end") playBotCue("lose");
      else if (
        sound &&
        result.actions.some((action) => action.startsWith("Upgraded"))
      )
        playBotCue("city");
      else if (
        sound &&
        result.actions.some((action) => action.startsWith("Built at"))
      )
        playBotCue("settlement");
      else if (
        sound &&
        result.actions.some((action) => action.startsWith("Built a road"))
      )
        playBotCue("road");
      else if (
        sound &&
        result.actions.some((action) => action.startsWith("Traded"))
      )
        playBotCue("trade");
      setGame(result.game);
    }, 800);
    return () => clearTimeout(timer);
  }, [started, isBotTurn, game, sound, pausedAt, showRollEffect]);
  useEffect(() => {
    if (!started || pausedAt !== null) return;
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
          current.progressed !== true &&
            current.turn === 0 &&
            current.phase === "roll"
            ? "Roll the dice to begin."
            : "Time is up. Pass the device to the next player.",
        );
        setActivity((previous) =>
          [
            ...previous,
            current.progressed !== true &&
            current.turn === 0 &&
            current.phase === "roll"
              ? "Waiting for the first roll."
              : `Player ${current.turn + 1} ran out of time.`,
          ].slice(-100),
        );
        setGame(next);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [started, sound, pausedAt, opponent]);
  const left = Math.min(
    120,
    Math.max(0, 120 - Math.floor((clock - game.turnStarted) / 1000)),
  );
  function choose(id: number, to?: number) {
    if (botTurn) return;
    if (game.phase !== "build") {
      if (sound) soundCue("error");
      setMessage("Roll before building.");
      return;
    }
    if (selectedBuilding) {
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
    }
    if (sound) soundCue("select");
    setTarget({ at: id, to });
  }
  function build(
    building: import("./engine").Building,
    at: number,
    to?: number,
  ) {
    if (botTurn || game.phase !== "build") return;
    if (opponent === "online") {
      onlineCommand({ type: "build", building, at, to });
      return;
    }
    const now = Date.now();
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
      if (sound)
        soundCue(
          next.phase === "end"
            ? "win"
            : building === "market" || building === "farm"
              ? "settlement"
              : building,
        );
      log(
        `Player ${game.turn + 1} built a ${building}${building === "road" ? "" : ` at corner ${at + 1}`}.`,
      );
      setMessage(
        `${building[0].toUpperCase() + building.slice(1)} built. Turn complete.`,
      );
    }
    gameRef.current = next;
    setClock(now);
    setGame(next);
    setTarget(null);
  }
  function tradeWithBank(give: Goods, receive: Goods) {
    if (opponent === "online") {
      onlineCommand({ type: "bank", give, receive });
      return;
    }
    const rate = (game.players[game.turn].markets?.length ?? 0) > 0 ? 3 : 4;
    const next = transition(game, { type: "bank", give, receive });
    if (next === game) return;
    setGame(next);
    setMessage(`Traded ${rate} ${give} for one ${receive}.`);
    log(`Player ${game.turn + 1} traded ${rate} ${give} for 1 ${receive}.`);
    if (sound) soundCue("bank");
  }
  function tradeWithPlayer(give: Goods, receive: Goods) {
    const next = transition(game, { type: "playerTrade", give, receive });
    if (next === game) return false;
    setGame(next);
    setMessage(`Traded one ${give} for one ${receive}.`);
    log(
      `Player ${game.turn + 1} traded 1 ${give} for 1 ${receive} with ${opponent === "bot" ? "the bot" : `Player ${2 - game.turn}`}.`,
    );
    if (sound) soundCue("trade");
    return true;
  }
  function enterGame(resume: boolean) {
    welcomeMusicRef.current?.stop();
    welcomeMusicRef.current = null;
    const now = Date.now();
    if (sound) soundCue("start");
    if (resume) {
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
    const now = Date.now();
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
    const now = Date.now();
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
  function leaveGame() {
    if (opponent === "online") {
      if (onlineSocket.current) onlineSocket.current.onclose = null;
      onlineSocket.current?.close();
      onlineSocket.current = null;
      onlineRef.current = null;
      setOnline(null);
      setOpponent("bot");
      setStarted(false);
      setPausedAt(null);
      stopSoundEffects();
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
  }
  function rollDice() {
    if (game.phase !== "roll" || botTurn || pausedAt !== null) return;
    if (opponent === "online") {
      onlineCommand({ type: "roll" });
      return;
    }
    const first = Math.floor(Math.random() * 6) + 1,
      second = Math.floor(Math.random() * 6) + 1;
    setDiceFaces([first, second]);
    setDiceAnimation((n) => n + 1);
    showRollEffect(first + second);
    if (sound) soundCue("roll");
    log(`Player ${game.turn + 1} rolled ${first + second}.`);
    const next = transition(game, { type: "roll", total: first + second });
    gameRef.current = next;
    setGame(next);
  }
  function endTurn() {
    if (game.phase === "end" || botTurn || pausedAt !== null) return;
    if (opponent === "online") {
      onlineCommand({ type: "endTurn" });
      return;
    }
    log(`Player ${game.turn + 1} ended their turn.`);
    if (sound) soundCue("turn");
    const next = transition(game, { type: "endTurn", now: Date.now() });
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
            onClose={() => setOnlineLobby(false)}
            onReady={enterOnline}
          />
        )}
        {confirmation}
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
                else window.location.assign(standalone ? "about:blank" : "/");
              }}
            >
              Leave game
            </button>
          </div>
          {!standalone && <a href="/">Back to Hexari</a>}
        </div>
      </main>
    );
  }
  return (
    <div className="forge-page" style={{ zoom: tableScale }}>
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
          onViewBoard={() => setResultDismissed(true)}
          onPlayAgain={() => {
            if (opponent === "online") {
              leaveGame();
              setOnlineLobby(true);
              return;
            }
            startNewGame();
            if (sound) soundCue("start");
          }}
        />
      )}
      {settingsOpen && (
        <ForgeSettings
          sound={sound}
          onSound={toggleSound}
          volume={volume}
          onVolume={setVolume}
          fontSize={fontSize}
          onFontSize={setFontSize}
          shortcuts={shortcuts}
          onShortcuts={setShortcuts}
          onClose={() => setSettingsOpen(false)}
        />
      )}
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
        <div
          className="forge-game-menu"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setMenuOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setMenuOpen(false);
              event.currentTarget
                .querySelector<HTMLButtonElement>(".forge-settings-toggle")
                ?.focus();
            }
          }}
        >
          <button
            className="button ghost forge-settings-toggle"
            type="button"
            aria-label="Game menu"
            title="Game menu"
            aria-expanded={menuOpen}
            aria-controls="forge-game-menu"
            onClick={() => setMenuOpen(!menuOpen)}
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
          {menuOpen && (
            <div
              id="forge-game-menu"
              className="forge-game-menu-panel"
              aria-label="Game options"
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setSettingsOpen(true);
                }}
              >
                Settings
              </button>
              <button
                type="button"
                disabled={game.phase === "end"}
                onClick={pauseGame}
              >
                Pause game
              </button>
              <button
                type="button"
                className="forge-leave-game"
                onClick={leaveGame}
              >
                Leave game
              </button>
            </div>
          )}
        </div>
        <button
          className="button ghost forge-restart"
          type="button"
          aria-label="Start a new game"
          title="Start a new game"
          onClick={() => setPendingConfirmation("restart")}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 11a8 8 0 1 1 2.3 5.7M4 4v7h7"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
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
                viewBox="-80 -80 640 530"
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
                        transform={`translate(${240 + c.x * 45} ${185 + c.y * 45 - 14})`}
                        aria-label={`${t.resource} terrain`}
                      >
                        <TerrainArt resource={t.resource} />
                      </g>
                      {t.number && (
                        <>
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
                        </>
                      )}
                    </g>
                  );
                })}
                {game.players.flatMap((p, i) =>
                  p.roads.map(([a, b]) => (
                    <g
                      key={`${i}-${a}-${b}`}
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
                {game.phase === "build" &&
                  !botTurn &&
                  (!selectedBuilding || selectedBuilding === "road") &&
                  buildAvailability.find((item) => item.building === "road")
                    ?.available &&
                  vertices.flatMap((v) =>
                    v.neighbors
                      .filter((id) => id > v.id && legalRoad(game, v.id, id))
                      .map((id) => {
                        const other = vertices[id];
                        return (
                          <g key={`option-${v.id}-${id}`}>
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
                              onClick={() => choose(v.id, id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  choose(v.id, id);
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
                  const available =
                    !botTurn &&
                    buildAvailability.some(
                      (option) =>
                        option.available &&
                        (!selectedBuilding ||
                          selectedBuilding === option.building) &&
                        (option.corners.includes(v.id) ||
                          (option.building === "road" &&
                            option.edges.some(
                              ([a, b]) => a === v.id || b === v.id,
                            ))),
                    );
                  return (
                    <g key={v.id}>
                      <circle
                        cx={240 + v.x * 45}
                        cy={185 + v.y * 45}
                        r={owner >= 0 ? (city ? 9 : 7) : 5}
                        fill={
                          owner === 0
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
                        aria-label={`Corner ${v.id + 1}${owner >= 0 ? `, player ${owner + 1} ${city ? "city" : "settlement"}` : ""}`}
                        onClick={() => choose(v.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            choose(v.id);
                          }
                        }}
                      />
                      {owner >= 0 && (
                        <g
                          pointerEvents="none"
                          transform={`translate(${240 + v.x * 45} ${185 + v.y * 45})`}
                        >
                          <BuildingArt city={city} owner={owner} />
                          {(game.players[owner].farms ?? []).includes(v.id) && (
                            <text x="10" y="-8" fontSize="9">
                              🌾
                            </text>
                          )}
                          {(game.players[owner].markets ?? []).includes(
                            v.id,
                          ) && (
                            <text x="10" y="-8" fontSize="9" fill="#fff">
                              ⚖
                            </text>
                          )}
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
              {target && game.phase === "build" && !botTurn && (
                <ForgeBuildPopover
                  game={game}
                  target={target}
                  onBuild={build}
                  onClose={() => setTarget(null)}
                  selectedBuilding={selectedBuilding}
                />
              )}
            </div>
          </div>
        </div>
        <div className="forge-side">
          <div className="panel forge-controls">
            <div className="section-kicker">CURRENT TURN</div>
            {game.phase === "end" && resultDismissed && (
              <button
                type="button"
                className="button ghost forge-show-result"
                onClick={() => setResultDismissed(false)}
              >
                View result
              </button>
            )}
            <div className="turn-header">
              <h2>
                {game.phase === "end"
                  ? `Player ${(game.winner ?? 0) + 1} wins!`
                  : botTurn
                    ? opponent === "online"
                      ? "Opponent's turn"
                      : "Bot's turn"
                    : `Player ${game.turn + 1}`}
              </h2>
              <strong>
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
              </strong>
            </div>
            <p>
              {game.phase === "roll"
                ? "Roll to begin your turn."
                : game.phase === "build"
                  ? "Build, trade, or end your turn."
                  : "Start a new game to play again."}
            </p>
            <div className="scoreboard">
              {game.players.map((p, i) => (
                <div key={i}>
                  <small>
                    {i === 1 && opponent === "bot"
                      ? "BOT"
                      : opponent === "bot"
                        ? "YOU"
                        : `PLAYER ${i + 1}`}
                    {game.phase !== "end" && game.turn === i ? " · TURN" : ""}
                  </small>
                  <strong>
                    {points(p)} <small>/ 5 VP</small>
                  </strong>
                </div>
              ))}
            </div>
            {game.phase !== "end" && (
              <>
                <fieldset className="forge-action-group" disabled={botTurn}>
                  <div className="field-label">BUILD</div>
                  <p role="status" className="hint">
                    {message}
                  </p>
                  <p className="hint">
                    Select an edge or corner to build. A build ends your turn.
                  </p>
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
                                `Player ${game.turn + 1} discarded one ${resource}.`,
                              );
                              if (sound) soundCue("discard");
                            }
                          }}
                        >
                          <svg viewBox="-20 -20 40 40" aria-hidden="true">
                            <TerrainArt resource={resource} />
                          </svg>
                          <span className="forge-bank-count" aria-hidden="true">
                            −1
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                </fieldset>
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
            <ForgeCoach game={game} botTurn={botTurn} />
            <ForgeActivity
              activity={activity}
              chat={chat}
              setChat={setChat}
              bot={opponent === "bot"}
              player={game.turn + 1}
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
                disabled={game.phase !== "roll"}
                aria-label={
                  game.phase === "roll"
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
                  {game.phase === "roll"
                    ? "Tap the dice to roll"
                    : `Rolled ${game.dice}`}
                </span>
              </button>
              <ForgeBuildCards
                game={game}
                botTurn={botTurn}
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
              <span className="forge-hand-label">
                Your hand <small>MAX 7</small>
              </span>
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
