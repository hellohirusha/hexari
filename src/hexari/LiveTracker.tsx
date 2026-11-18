import InlineChoices from "../shared/InlineChoices";
import { useEffect, useState } from "react";
import { beliefSummary } from "./engine/belief";
import { rollDeviation } from "./engine/rollDistribution";
import {
  recordLiveEvent,
  parseCorners,
  startSession,
  type LiveSession,
} from "./engine/liveTracker";
import type { TrackedPlayer } from "./engine/session";
import { decodeBoard, encodeBoard, pips, type Tile } from "../shared/board";
import { emptyHand, goods, type Goods } from "../shared/resources";

const key = "hexari-live-session-v2";
const defaultPlayers = (): TrackedPlayer[] =>
  [1, 2].map((n) => ({ name: `Player ${n}`, corners: "", hand: emptyHand() }));
function restore(): LiveSession | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const session = value as LiveSession;
    if (
      !Array.isArray(session.players) ||
      session.players.length < 2 ||
      session.players.length > 4 ||
      !Array.isArray(session.worlds) ||
      !session.worlds.length ||
      !Array.isArray(session.rolls) ||
      !Array.isArray(session.history)
    )
      return null;
    if (
      session.board !== undefined &&
      (!Array.isArray(session.board) ||
        !decodeBoard(encodeBoard(session.board)))
    )
      return null;
    if (
      !session.players.every(
        (p) =>
          typeof p.name === "string" &&
          typeof p.corners === "string" &&
          parseCorners(p.corners) !== null &&
          (p.cities === undefined ||
            (Array.isArray(p.cities) &&
              p.cities.every(
                (id) => Number.isInteger(id) && id >= 0 && id < 54,
              ))),
      ) ||
      !session.worlds.every(
        (w) =>
          Number.isFinite(w.probability) &&
          w.probability > 0 &&
          Array.isArray(w.hands) &&
          w.hands.length === session.players.length &&
          w.hands.every((h) =>
            goods.every((g) => Number.isSafeInteger(h[g]) && h[g] >= 0),
          ),
      )
    )
      return null;
    const total = session.worlds.reduce((sum, w) => sum + w.probability, 0);
    if (
      Math.abs(total - 1) > 0.00001 ||
      !session.rolls.every((n) => Number.isInteger(n) && n >= 2 && n <= 12) ||
      !session.history.every((h) => typeof h === "string")
    )
      return null;
    return session;
  } catch {
    return null;
  }
}
function oldPlayers(): TrackedPlayer[] {
  try {
    const old = JSON.parse(localStorage.getItem("hexari-session-v1") ?? "null");
    if (
      Array.isArray(old?.players) &&
      old.players.length >= 2 &&
      old.players.length <= 4 &&
      old.players.every(
        (p: TrackedPlayer) =>
          typeof p.name === "string" &&
          typeof p.corners === "string" &&
          p.hand &&
          goods.every((g) => Number.isSafeInteger(p.hand[g]) && p.hand[g] >= 0),
      )
    )
      return old.players;
  } catch {
    /* use defaults */
  }
  return defaultPlayers();
}
export default function LiveTracker({ board }: { board: Tile[] }) {
  const [session, setSession] = useState<LiveSession | null>(restore);
  const [players, setPlayers] = useState<TrackedPlayer[]>(oldPlayers);
  const [cityInputs, setCityInputs] = useState<string[]>([]);
  const [actor, setActor] = useState(0),
    [other, setOther] = useState(1);
  const [kind, setKind] = useState<
    "build" | "trade" | "bundleTrade" | "bankTrade" | "steal" | "unknownSteal"
  >("unknownSteal");
  const [building, setBuilding] = useState<
    "road" | "settlement" | "city" | "development"
  >("road");
  const [give, setGive] = useState<Goods>("wood"),
    [receive, setReceive] = useState<Goods>("ore");
  const [giveCount, setGiveCount] = useState(1);
  const [receiveCount, setReceiveCount] = useState(1);
  const [bundleGive, setBundleGive] = useState(emptyHand);
  const [bundleReceive, setBundleReceive] = useState(emptyHand);
  const [corner, setCorner] = useState(1);
  const [correctedHand, setCorrectedHand] = useState(emptyHand);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (session) localStorage.setItem(key, JSON.stringify(session));
    else localStorage.removeItem(key);
  }, [session]);
  function record(event: Parameters<typeof recordLiveEvent>[1]) {
    if (!session) return;
    const next = recordLiveEvent(session, event, board);
    if (!next) {
      setMessage(
        "This action is impossible with the tracked hands, or exceeds the calculation limit.",
      );
      return;
    }
    setSession(next);
    setMessage("Recorded.");
  }
  if (!session)
    return (
      <>
        <h2>Start a game log</h2>
        <p>Enter starting hands and settlement corners.</p>
        <div className="player-grid">
          {players.map((p, i) => (
            <div className="tool-card" key={i}>
              <label>
                Player name
                <input
                  value={p.name}
                  onChange={(e) =>
                    setPlayers((ps) =>
                      ps.map((x, j) =>
                        i === j ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Settlement corners
                <input
                  value={p.corners}
                  placeholder="e.g. 8, 22"
                  onChange={(e) =>
                    setPlayers((ps) =>
                      ps.map((x, j) =>
                        i === j ? { ...x, corners: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                City corners
                <input
                  value={cityInputs[i] ?? ""}
                  placeholder="e.g. 14, 30"
                  onChange={(e) =>
                    setCityInputs((previous) => {
                      const next = [...previous];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                />
              </label>
              <div className="hand">
                {goods.map((g) => (
                  <label key={g}>
                    {g}
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={p.hand[g]}
                      onChange={(e) =>
                        setPlayers((ps) =>
                          ps.map((x, j) =>
                            i === j
                              ? {
                                  ...x,
                                  hand: {
                                    ...x.hand,
                                    [g]: Math.max(
                                      0,
                                      Math.floor(Number(e.target.value) || 0),
                                    ),
                                  },
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="detail-actions">
          <button
            className="button ghost"
            disabled={players.length >= 4}
            onClick={() =>
              setPlayers((ps) => [
                ...ps,
                {
                  name: `Player ${ps.length + 1}`,
                  corners: "",
                  hand: emptyHand(),
                },
              ])
            }
          >
            Add player
          </button>
          <button
            className="button primary"
            onClick={() => {
              const cities = players.map((_, index) =>
                parseCorners(cityInputs[index] ?? ""),
              );
              const next = cities.some((value) => value === null)
                ? null
                : startSession(
                    players.map((player, index) => ({
                      ...player,
                      cities: cities[index]!,
                    })),
                    board,
                  );
              if (next) {
                setSession(next);
                setMessage("");
              } else
                setMessage(
                  "Check player names, hands and corner numbers. Buildings cannot share a corner or occupy adjacent corners.",
                );
            }}
          >
            Start tracking
          </button>
        </div>
        <p role="status">{message}</p>
      </>
    );
  return (
    <>
      <h2>Game log</h2>
      <p>
        Hands are estimates based on recorded actions. Unknown steals assume a
        random card.
      </p>
      {session.board && (
        <p className="hint">
          This log uses the board from when tracking started.
        </p>
      )}
      <div className="field-label">LOG A ROLL</div>
      <div className="rolls">
        {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
          <button key={n} onClick={() => record({ type: "roll", number: n })}>
            {n}
          </button>
        ))}
      </div>
      <div className="distribution">
        {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
          <div key={n}>
            <span>{n}</span>
            <strong>{session.rolls.filter((x) => x === n).length}</strong>
            <small>
              expected{" "}
              {((session.rolls.length * (n === 7 ? 6 : pips[n])) / 36).toFixed(
                1,
              )}
            </small>
            {rollDeviation(session.rolls, n) && (
              <small>
                {rollDeviation(session.rolls, n) === "low"
                  ? "Unusually low"
                  : "Unusually high"}
              </small>
            )}
          </div>
        ))}
      </div>
      <p className="hint">Past rolls do not affect the next roll.</p>
      <section className="result-card">
        <h3>Record an action</h3>
        <div className="trade-form">
          <fieldset className="choice-field">
            <legend>Action</legend>
            <InlineChoices
              aria-label="Action"
              value={kind}
              onChange={(value) => setKind(value as typeof kind)}
            >
              <option value="unknownSteal">Unknown steal</option>
              <option value="steal">Known steal</option>
              <option value="trade">Trade</option>
              <option value="bundleTrade">Mixed trade</option>
              <option value="bankTrade">Bank trade</option>
              <option value="build">Build</option>
            </InlineChoices>
          </fieldset>
          <fieldset className="choice-field">
            <legend>Player</legend>
            <InlineChoices
              aria-label="Player"
              value={actor}
              onChange={(value) => {
                const selected = Number(value);
                setActor(selected);
                if (selected === other)
                  setOther((selected + 1) % session.players.length);
              }}
            >
              {session.players.map((p, i) => (
                <option value={i} key={i}>
                  {p.name}
                </option>
              ))}
            </InlineChoices>
          </fieldset>
          {kind !== "build" && kind !== "bankTrade" && (
            <fieldset className="choice-field">
              <legend>Other player</legend>
              <InlineChoices
                aria-label="Other player"
                value={other}
                onChange={(value) => setOther(Number(value))}
              >
                {session.players.map((p, i) => (
                  <option value={i} key={i}>
                    {p.name}
                  </option>
                ))}
              </InlineChoices>
            </fieldset>
          )}
          {kind === "build" ? (
            <>
              <fieldset className="choice-field">
                <legend>Purchase</legend>
                <InlineChoices
                  aria-label="Purchase"
                  value={building}
                  onChange={(value) => setBuilding(value as typeof building)}
                >
                  {["road", "settlement", "city", "development"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </InlineChoices>
              </fieldset>
              {(building === "settlement" || building === "city") && (
                <label>
                  Corner number
                  <input
                    type="number"
                    min="1"
                    max="54"
                    step="1"
                    value={corner}
                    onChange={(e) => setCorner(Number(e.target.value))}
                  />
                </label>
              )}
            </>
          ) : (
            (kind === "trade" || kind === "steal") && (
              <fieldset className="choice-field">
                <legend>{kind === "trade" ? "Give" : "Stolen resource"}</legend>
                <InlineChoices
                  aria-label={kind === "trade" ? "Give" : "Stolen resource"}
                  value={give}
                  onChange={(value) => setGive(value as Goods)}
                >
                  {goods.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </InlineChoices>
              </fieldset>
            )
          )}
          {kind === "trade" && (
            <>
              <fieldset className="choice-field">
                <legend>Receive</legend>
                <InlineChoices
                  aria-label="Receive"
                  value={receive}
                  onChange={(value) => setReceive(value as Goods)}
                >
                  {goods.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </InlineChoices>
              </fieldset>
              <label>
                Give quantity
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={giveCount}
                  onChange={(event) => setGiveCount(Number(event.target.value))}
                />
              </label>
              <label>
                Receive quantity
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={receiveCount}
                  onChange={(event) =>
                    setReceiveCount(Number(event.target.value))
                  }
                />
              </label>
            </>
          )}
          {(kind === "bundleTrade" || kind === "bankTrade") && (
            <>
              <p>
                Enter the cards exchanged as observed
                {kind === "bankTrade"
                  ? "; bank rates and stock are not checked"
                  : ""}
                .
              </p>
              {(
                [
                  { label: "Give", hand: bundleGive, set: setBundleGive },
                  {
                    label: "Receive",
                    hand: bundleReceive,
                    set: setBundleReceive,
                  },
                ] as const
              ).map((side) => (
                <fieldset className="choice-field" key={side.label}>
                  <legend>{side.label}</legend>
                  <div className="hand">
                    {goods.map((resource) => (
                      <label key={resource}>
                        {resource}
                        <input
                          type="number"
                          min="0"
                          max="99"
                          step="1"
                          aria-label={`${side.label} ${resource} quantity`}
                          value={side.hand[resource]}
                          onChange={(event) =>
                            side.set((previous) => ({
                              ...previous,
                              [resource]: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </>
          )}
        </div>
        <button
          className="button primary"
          onClick={() =>
            record(
              kind === "build"
                ? {
                    type: kind,
                    player: actor,
                    building,
                    ...(building === "settlement" || building === "city"
                      ? { corner: corner - 1 }
                      : {}),
                  }
                : kind === "bundleTrade" || kind === "bankTrade"
                  ? {
                      type: "bundleTrade",
                      player: actor,
                      other: kind === "bankTrade" ? null : other,
                      give: bundleGive,
                      receive: bundleReceive,
                    }
                  : kind === "trade"
                    ? {
                        type: kind,
                        player: actor,
                        other,
                        give,
                        receive,
                        giveCount,
                        receiveCount,
                      }
                    : kind === "steal"
                      ? { type: kind, player: actor, other, resource: give }
                      : { type: kind, player: actor, other },
            )
          }
        >
          Record action
        </button>
        <p role="status">{message}</p>
      </section>
      <div className="player-grid">
        {session.players.map((p, i) => (
          <section className="tool-card" key={i}>
            <h3>{p.name}</h3>
            <p>
              Settlements: {p.corners || "None"} · Cities:{" "}
              {(p.cities ?? []).map((id) => id + 1).join(", ") || "None"}
            </p>
            {goods.map((g) => (
              <div key={g}>
                <strong>{g}</strong>{" "}
                {beliefSummary(session.worlds, i, g)
                  .map(
                    (x) => `${x.count}: ${(x.probability * 100).toFixed(0)}%`,
                  )
                  .join(" · ")}
              </div>
            ))}
          </section>
        ))}
      </div>
      <p className="hint">
        {session.worlds.length} possible hand states. Unrecorded actions and
        incorrect starting hands affect estimates.
      </p>
      <section className="result-card">
        <h3>Correct a hand</h3>
        <p>
          Use this when a known action was missed. The selected player's hand
          becomes this exact snapshot.
        </p>
        <fieldset className="choice-field">
          <legend>Player</legend>
          <InlineChoices
            aria-label="Player to correct"
            value={actor}
            onChange={(value) => setActor(Number(value))}
          >
            {session.players.map((p, i) => (
              <option value={i} key={i}>
                {p.name}
              </option>
            ))}
          </InlineChoices>
        </fieldset>
        <div className="hand">
          {goods.map((g) => (
            <label key={g}>
              {g}
              <input
                type="number"
                min="0"
                step="1"
                value={correctedHand[g]}
                onChange={(e) =>
                  setCorrectedHand((previous) => ({
                    ...previous,
                    [g]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  }))
                }
              />
            </label>
          ))}
        </div>
        <button
          className="button ghost"
          onClick={() =>
            record({
              type: "handCorrection",
              player: actor,
              hand: correctedHand,
            })
          }
        >
          Update estimate
        </button>
      </section>
      {session.history.length > 0 && (
        <section className="result-card">
          <h3>Recent activity</h3>
          <ol>
            {session.history.slice(0, 12).map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ol>
        </section>
      )}
      <button
        className="button ghost"
        onClick={() => {
          if (confirm("Start a new session? This clears the current log.")) {
            setPlayers(session.players);
            setCityInputs(
              session.players.map((player) =>
                (player.cities ?? []).map((id) => id + 1).join(", "),
              ),
            );
            setSession(null);
            setMessage("");
          }
        }}
      >
        New session
      </button>
    </>
  );
}
