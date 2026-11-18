import { useState } from "react";
import { defaultBoard } from "./board";
import { points, type Game, type Player } from "./engine";
import ForgeMessageDialog from "./ForgeMessageDialog";
import { requestCoach } from "../shared/coachClient";
import { useRef } from "react";

const questions = [
  "What should I build?",
  "How do I catch up?",
  "What is my winning line?",
] as const;
const questionLabels = ["Build", "Catch up", "Win"] as const;
function describePlayer(player: Player) {
  const corners = (values: number[]) =>
    values.length ? values.map((value) => value + 1).join(", ") : "none";
  return `settlements: ${corners(player.settlements)}; cities: ${corners(player.cities)}; farms: ${corners(player.farms ?? [])}; markets: ${corners(player.markets ?? [])}; roads: ${player.roads.length ? player.roads.map(([a, b]) => `${a + 1}-${b + 1}`).join(", ") : "none"}; points: ${points(player)}`;
}

export default function ForgeCoach({
  game,
  botTurn,
}: {
  game: Game;
  botTurn: boolean;
}) {
  const [question, setQuestion] = useState<(typeof questions)[number]>(
    questions[0],
  );
  const [result, setResult] = useState<{
    player: number;
    answer: string;
    error: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  async function ask() {
    if (busy || botTurn || game.phase === "end") return;
    const player = game.turn + 1;
    const me = game.players[game.turn],
      other = game.players[1 - game.turn];
    setBusy(true);
    setResult(null);
    const controller = new AbortController();
    request.current = controller;
    try {
      const advice = await requestCoach(
        {
          board: defaultBoard,
          turn: null,
          vp: points(me),
          hand: me.hand,
          question,
          buildings: `Forge speed variant: first to 5 points; settlements 1 point, cities 2. Farms at wheat-adjacent buildings grant one extra wheat on a matching roll; markets improve bank trades from 4:1 to 3:1. Improvements give no points; one improvement per building. A successful build ends the turn. No robber, ports, development cards or longest-road points. Seven-card hand cap, excess production lost, one-card-for-one-card player trades require acceptance, voluntary discards allowed. Each player starts with one settlement and one of each resource. Current phase: ${game.phase}. Current player: ${describePlayer(me)}.`,
          opponents: `Visible opponent: ${describePlayer(other)}. Opponent hand is hidden.`,
          history: [],
        },
        (answer) => setResult({ player, answer, error: false }),
        controller.signal,
      );
      setResult({ player, answer: advice, error: false });
    } catch (error) {
      if (controller.signal.aborted) return;
      setResult({
        player,
        answer:
          error instanceof Error
            ? error.message
            : "The coach could not respond.",
        error: true,
      });
    } finally {
      request.current = null;
      setBusy(false);
    }
  }
  return (
    <section
      className="forge-coach forge-side-card"
      aria-labelledby="forge-coach-heading"
    >
      <h3 id="forge-coach-heading" className="forge-side-heading">
        AI coach
      </h3>
      <div className="forge-coach-body">
        <p className="forge-coach-privacy">Sends your game state to AI.</p>
        <div className="forge-coach-actions">
          <div
            className="forge-coach-options"
            role="group"
            aria-label="Choose a coaching question"
          >
            {questions.map((item, index) => (
              <button
                key={item}
                type="button"
                className="forge-coach-option"
                aria-label={item}
                title={item}
                aria-pressed={question === item}
                disabled={busy}
                onClick={() => {
                  setQuestion(item);
                  setResult(null);
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {index === 0 ? (
                    <>
                      <path d="M3 11.5 12 4l9 7.5M5.5 10.5V20h13v-9.5M10 20v-5h4v5" />
                    </>
                  ) : index === 1 ? (
                    <>
                      <path d="M4 19h16M6 15l4-4 3 2 5-7M14 6h4v4" />
                    </>
                  ) : (
                    <>
                      <path d="M8 3h8v4a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 11v5m-4 4h8m-7-4h6v4H9z" />
                    </>
                  )}
                </svg>
                <span>{questionLabels[index]}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="forge-coach-submit"
            aria-label={busy ? "Coach is thinking" : "Ask coach"}
            title={busy ? "Thinking..." : "Ask coach"}
            disabled={busy || botTurn || game.phase === "end"}
            onClick={ask}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 12h15m-6-6 6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <span className="sr-only" role="status">
          {busy ? "Coach is thinking" : ""}
        </span>
        {botTurn && <p className="hint">Available on your turn.</p>}
        {result && (
          <ForgeMessageDialog
            title={
              result.error
                ? "Coach unavailable"
                : `Advice for Player ${result.player}`
            }
            onClose={() => {
              request.current?.abort();
              setResult(null);
            }}
          >
            <p>{result.answer}</p>
            {!result.error && (
              <small>Based on the position when you asked.</small>
            )}
          </ForgeMessageDialog>
        )}
      </div>
    </section>
  );
}
