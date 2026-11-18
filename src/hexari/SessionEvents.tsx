import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { goods, type Goods } from "../shared/resources";
import {
  applySessionEvent,
  type SessionEvent,
  type TrackedPlayer,
} from "./engine/session";

export default function SessionEvents({
  players,
  setPlayers,
  resetKey,
}: {
  players: TrackedPlayer[];
  setPlayers: Dispatch<SetStateAction<TrackedPlayer[]>>;
  resetKey: number;
}) {
  const [kind, setKind] = useState<"build" | "trade" | "steal">("build"),
    [actor, setActor] = useState(0),
    [other, setOther] = useState(1),
    [building, setBuilding] = useState<
      "road" | "settlement" | "city" | "development"
    >("road"),
    [give, setGive] = useState<Goods>("wood"),
    [receive, setReceive] = useState<Goods>("ore"),
    [message, setMessage] = useState("");
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem("hexari-session-events") ?? "[]",
      );
      return Array.isArray(value) && value.every((x) => typeof x === "string")
        ? value
        : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem("hexari-session-events", JSON.stringify(history));
  }, [history]);
  function log() {
    const event: SessionEvent =
      kind === "build"
        ? { type: kind, player: actor, building }
        : kind === "trade"
          ? { type: kind, player: actor, other, give, receive }
          : { type: kind, player: actor, other, resource: give };
    const result = applySessionEvent(players, event);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    const entry =
      kind === "build"
        ? `${players[actor].name} built ${building}`
        : kind === "trade"
          ? `${players[actor].name} traded ${give} for ${receive} with ${players[other].name}`
          : `${players[actor].name} stole ${give} from ${players[other].name}`;
    setPlayers(result.players);
    setHistory((h) => [entry, ...h].slice(0, 100));
    setMessage("Event recorded.");
  }
  return (
    <section className="result-card" key={resetKey}>
      <h3>Record an observed action</h3>
      <p>
        Use this when the resource types are known. Totals are estimates and may
        differ from hidden hands.
      </p>
      <div className="trade-form">
        <label>
          Action
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="build">Build or buy development card</option>
            <option value="trade">Trade one card each</option>
            <option value="steal">Known steal</option>
          </select>
        </label>
        <label>
          Player
          <select
            value={actor}
            onChange={(e) => setActor(Number(e.target.value))}
          >
            {players.map((p, i) => (
              <option key={i} value={i}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {kind !== "build" && (
          <label>
            Other player
            <select
              value={other}
              onChange={(e) => setOther(Number(e.target.value))}
            >
              {players.map((p, i) => (
                <option key={i} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "build" ? (
          <label>
            Purchase
            <select
              value={building}
              onChange={(e) => setBuilding(e.target.value as typeof building)}
            >
              <option value="road">Road</option>
              <option value="settlement">Settlement</option>
              <option value="city">City</option>
              <option value="development">Development card</option>
            </select>
          </label>
        ) : (
          <label>
            {kind === "trade" ? "Player gives" : "Resource stolen"}
            <select
              value={give}
              onChange={(e) => setGive(e.target.value as Goods)}
            >
              {goods.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
        )}
        {kind === "trade" && (
          <label>
            Player receives
            <select
              value={receive}
              onChange={(e) => setReceive(e.target.value as Goods)}
            >
              {goods.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <button className="button primary" onClick={log}>
        Record event
      </button>
      <p role="status">{message}</p>
      {history.length > 0 && (
        <>
          <strong>Recent events</strong>
          <ol>
            {history.slice(0, 8).map((entry, i) => (
              <li key={`${i}-${entry}`}>{entry}</li>
            ))}
          </ol>
          <button className="button ghost" onClick={() => setHistory([])}>
            Clear event history
          </button>
        </>
      )}
    </section>
  );
}
