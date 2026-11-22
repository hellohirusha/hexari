import InlineChoices from "../shared/InlineChoices";
import { useEffect, useState } from "react";
import { beliefSummary } from "./engine/belief";
import { rollDeviation } from "./engine/rollDistribution";
import {
  recordLiveEvent,
  parseCorners,
  startSession,
  trackedPosition,
  type LiveSession,
  type TrackedPosition,
} from "./engine/liveTracker";
import type { TrackedPlayer } from "./engine/session";
import {
  decodeBoard,
  decodeBoardConfig,
  encodeBoard,
  encodeBoardConfig,
  pips,
  type Port,
  type Tile,
} from "../shared/board";
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
      session.robberTile !== undefined &&
      session.robberTile !== null &&
      (!Number.isInteger(session.robberTile) ||
        session.robberTile < 0 ||
        session.robberTile >= 19)
    )
      return null;
    if (
      session.firstRollTurn !== undefined &&
      (!Number.isSafeInteger(session.firstRollTurn) ||
        session.firstRollTurn < 1 ||
        session.firstRollTurn > 1000)
    )
      return null;
    if (
      session.ports !== undefined &&
      (!session.board ||
        !Array.isArray(session.ports) ||
        !decodeBoardConfig(
          btoa(
            JSON.stringify({
              version: 1,
              board: session.board,
              ports: session.ports,
            }),
          ),
        ))
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
export default function LiveTracker({
  board,
  boardPorts,
  onUsePosition,
}: {
  board: Tile[];
  boardPorts: Port[];
  onUsePosition: (position: TrackedPosition) => void;
}) {
  const [session, setSession] = useState<LiveSession | null>(restore);
  const [players, setPlayers] = useState<TrackedPlayer[]>(oldPlayers);
  const [cityInputs, setCityInputs] = useState<string[]>([]);
  const [firstRollTurn, setFirstRollTurn] = useState(1);
  const [actor, setActor] = useState(0),
    [other, setOther] = useState(1);
  const [kind, setKind] = useState<
    | "build"
    | "trade"
    | "bundleTrade"
    | "bankTrade"
    | "steal"
    | "unknownSteal"
    | "moveRobber"
    | "discard"
    | "monopoly"
    | "yearOfPlenty"
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
  const [robberTile, setRobberTile] = useState(1);
  const [correctedHand, setCorrectedHand] = useState(emptyHand);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (session) localStorage.setItem(key, JSON.stringify(session));
    else localStorage.removeItem(key);
  }, [session]);
  function record(event: Parameters<typeof recordLiveEvent>[1]) {
    if (!session) return;
    const next = recordLiveEvent(session, event, board, boardPorts);
    if (!next) {
      setMessage(
        "This action is invalid for the tracked hands, ports or bank stock, or exceeds the calculation limit.",
      );
      return;
    }
    setSession(next);
    setMessage("Recorded.");
  }
  const matchingBoard =
    !session?.board ||
    encodeBoardConfig({
      board: session.board,
      ports: session.ports ?? boardPorts,
    }) === encodeBoardConfig({ board, ports: boardPorts });
  if (!session)
    return (
      <>
        <h2>Start a game log</h2>
        <p>Enter starting hands and settlement corners.</p>
        <label>
          Turn of the first roll to log
          <input
            type="number"
            min="1"
            max="1000"
            step="1"
            value={firstRollTurn}
            onChange={(event) => setFirstRollTurn(Number(event.target.value))}
          />
        </label>
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
                    boardPorts,
                    firstRollTurn,
                  );
              if (next) {
                setSession(next);
                setMessage("");
              } else
                setMessage(
                  "Check the turn, player names, hands and corner numbers. Buildings cannot share a corner or occupy adjacent corners.",
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
        Hands are estimates based on recorded actions. Steals assume a random
        card. Bank stock assumes 19 cards of each resource.
      </p>
      {session.robberTile !== null && session.robberTile !== undefined && (
        <p className="hint">Robber blocks tile {session.robberTile + 1}.</p>
      )}
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
              <option value="moveRobber">Move robber</option>
              <option value="discard">Discard cards</option>
              <option value="monopoly">Monopoly</option>
              <option value="yearOfPlenty">Year of Plenty</option>
            </InlineChoices>
          </fieldset>
          {kind !== "moveRobber" && (
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
          )}
          {(kind === "steal" ||
            kind === "unknownSteal" ||
            kind === "trade" ||
            kind === "bundleTrade") && (
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
            (kind === "trade" || kind === "steal" || kind === "monopoly") && (
              <fieldset className="choice-field">
                <legend>
                  {kind === "trade"
                    ? "Give"
                    : kind === "monopoly"
                      ? "Resource"
                      : "Stolen resource"}
                </legend>
                <InlineChoices
                  aria-label={
                    kind === "trade"
                      ? "Give"
                      : kind === "monopoly"
                        ? "Resource"
                        : "Stolen resource"
                  }
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
          {kind === "moveRobber" && (
            <label>
              Tile number
              <input
                type="number"
                min="1"
                max="19"
                step="1"
                value={robberTile}
                onChange={(event) => setRobberTile(Number(event.target.value))}
              />
            </label>
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
          {(kind === "bundleTrade" ||
            kind === "bankTrade" ||
            kind === "discard" ||
            kind === "yearOfPlenty") && (
            <>
              <p>
                {kind === "bankTrade"
                  ? "Bank rates use the player's ports and tracked stock."
                  : kind === "discard"
                    ? "Enter the observed discarded cards."
                    : kind === "yearOfPlenty"
                      ? "Choose two cards from the bank."
                      : "Enter the cards exchanged as observed."}
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
              )
                .filter(
                  (side) =>
                    (kind !== "discard" && kind !== "yearOfPlenty") ||
                    side.label === "Give",
                )
                .map((side) => (
                  <fieldset className="choice-field" key={side.label}>
                    <legend>
                      {kind === "discard"
                        ? "Discard"
                        : kind === "yearOfPlenty"
                          ? "Take"
                          : side.label}
                    </legend>
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
          onClick={() => {
            if (kind === "moveRobber")
              record({ type: kind, tile: robberTile - 1 });
            else if (kind === "build")
              record({
                type: kind,
                player: actor,
                building,
                ...(building === "settlement" || building === "city"
                  ? { corner: corner - 1 }
                  : {}),
              });
            else if (kind === "bundleTrade" || kind === "bankTrade")
              record({
                type: "bundleTrade",
                player: actor,
                other: kind === "bankTrade" ? null : other,
                give: bundleGive,
                receive: bundleReceive,
              });
            else if (kind === "trade")
              record({
                type: kind,
                player: actor,
                other,
                give,
                receive,
                giveCount,
                receiveCount,
              });
            else if (kind === "steal")
              record({ type: kind, player: actor, other, resource: give });
            else if (kind === "unknownSteal")
              record({ type: kind, player: actor, other });
            else if (kind === "monopoly")
              record({ type: kind, player: actor, resource: give });
            else record({ type: kind, player: actor, cards: bundleGive });
          }}
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
            <button
              type="button"
              className="button ghost compact"
              disabled={!matchingBoard}
              onClick={() => {
                const position = trackedPosition(session, i);
                if (!position) return;
                onUsePosition(position);
                setMessage(
                  position.hand
                    ? "Position and hand sent to trade and coach."
                    : "Position sent; hand remains unchanged because it is uncertain.",
                );
              }}
            >
              Use for trade and coach
            </button>
          </section>
        ))}
      </div>
      {!matchingBoard && (
        <p className="hint">
          Restore this session's board and ports before using its position in
          other tools.
        </p>
      )}
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
