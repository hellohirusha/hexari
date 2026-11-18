import { useState } from "react";
import { goods, type Goods } from "../shared/resources";
import {
  initialBelief,
  unknownSteal,
  observeResource,
  applyKnownChange,
  beliefSummary,
  type Hypothesis,
} from "./engine/belief";
import type { TrackedPlayer } from "./engine/session";

export default function UncertainSteals({
  players,
}: {
  players: TrackedPlayer[];
}) {
  const [worlds, setWorlds] = useState<Hypothesis[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [thief, setThief] = useState(0),
    [victim, setVictim] = useState(1),
    [observed, setObserved] = useState<Goods>("wood"),
    [message, setMessage] = useState("");
  function start() {
    const next = initialBelief(players.map((player) => player.hand));
    if (!next.length) {
      setMessage(
        "Enter non-negative whole card counts for at least two players.",
      );
      return;
    }
    setWorlds(next);
    setNames(players.map((player) => player.name));
    setThief(0);
    setVictim(1);
    setMessage(
      "Snapshot started. Later edits and rolls do not change this snapshot.",
    );
  }
  function applySteal() {
    const next = unknownSteal(worlds, thief, victim);
    if (!next) {
      setMessage(
        "Cannot apply this steal: choose different players, a non-empty victim, and stay within the calculation limit.",
      );
      return;
    }
    setWorlds(next);
    setMessage("Unknown steal applied under the random-card assumption.");
  }
  function observe() {
    const next = observeResource(worlds, victim, observed);
    if (!next) {
      setMessage("That observation is impossible under the current snapshot.");
      return;
    }
    setWorlds(next);
    setMessage("Probabilities updated using the observation.");
  }
  function change(delta: number) {
    const next = applyKnownChange(worlds, victim, observed, delta);
    if (!next) {
      setMessage("That change is impossible under the current snapshot.");
      return;
    }
    setWorlds(next);
    setMessage(
      delta > 0
        ? "Known gain applied."
        : "Known spend applied and impossible hands removed.",
    );
  }
  return (
    <section className="result-card">
      <h3>Explore an unknown steal</h3>
      <p>
        Start from the current tracked hands as an exact snapshot. This model
        assumes each card is equally likely to be stolen. Hidden trades or
        unlogged cards can make the result inaccurate.
      </p>
      <button className="button ghost" onClick={start}>
        Start or replace snapshot
      </button>
      {worlds.length > 0 && (
        <>
          <div className="trade-form">
            <label>
              Thief
              <select
                value={thief}
                onChange={(e) => setThief(Number(e.target.value))}
              >
                {names.map((name, i) => (
                  <option key={i} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Victim / observed player
              <select
                value={victim}
                onChange={(e) => setVictim(Number(e.target.value))}
              >
                {names.map((name, i) => (
                  <option key={i} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Observed resource
              <select
                value={observed}
                onChange={(e) => setObserved(e.target.value as Goods)}
              >
                {goods.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="detail-actions">
            <button className="button primary" onClick={applySteal}>
              Apply unknown steal
            </button>
            <button className="button ghost" onClick={observe}>
              Observe player has this resource
            </button>
            <button className="button ghost" onClick={() => change(1)}>
              Record known gain
            </button>
            <button className="button ghost" onClick={() => change(-1)}>
              Record known spend
            </button>
          </div>
          <div className="field-label">POSSIBLE HAND OF {names[victim]}</div>
          <div className="distribution">
            {goods.map((resource) => (
              <div key={resource}>
                <span>{resource}</span>
                <small>
                  {beliefSummary(worlds, victim, resource)
                    .map(
                      (x) => `${x.count}: ${(x.probability * 100).toFixed(0)}%`,
                    )
                    .join(" · ")}
                </small>
              </div>
            ))}
          </div>
          <p className="hint">
            Each entry is a card count followed by its probability.{" "}
            {worlds.length} possible hand state(s). This snapshot is not saved
            and does not automatically follow session events.
          </p>
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
