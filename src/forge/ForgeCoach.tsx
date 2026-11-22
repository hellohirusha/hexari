import { useEffect, useRef, useState } from "react";
import { type Game } from "./engine";
import { forgeCoachState, type ForgeCoachMemory } from "./coachContext";
import ForgeMessageDialog from "./ForgeMessageDialog";
import { requestCoach } from "../shared/coachClient";
import CoachAdvice from "../shared/CoachAdvice";

const questions = [
  "What should I build?",
  "How do I catch up?",
  "What is my winning line?",
] as const;
const questionLabels = ["Build", "Catch up", "Win"] as const;
type CoachHistory = [ForgeCoachMemory[], ForgeCoachMemory[]];
const historyKey = "forge-coach-history-v1";

export function clearLocalForgeCoachHistory() {
  try {
    localStorage.removeItem(historyKey);
  } catch {
    // Storage can be unavailable in private browsing.
  }
}

function historyStorage(onlineRoom: string | null) {
  return {
    storage: onlineRoom ? sessionStorage : localStorage,
    key: onlineRoom ? `${historyKey}:${onlineRoom}` : historyKey,
  };
}

export function readForgeCoachHistory(onlineRoom: string | null): CoachHistory {
  if (onlineRoom === "unavailable") return [[], []];
  try {
    const { storage, key } = historyStorage(onlineRoom);
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "null");
    if (!Array.isArray(parsed) || parsed.length !== 2) return [[], []];
    const seat = (value: unknown): ForgeCoachMemory[] =>
      Array.isArray(value)
        ? value
            .filter((item): item is ForgeCoachMemory =>
              Boolean(
                item &&
                typeof item.question === "string" &&
                typeof item.advice === "string",
              ),
            )
            .slice(-3)
            .map(({ question, advice }) => ({
              question: question.slice(0, 80),
              advice: advice.slice(0, 600),
            }))
        : [];
    return [seat(parsed[0]), seat(parsed[1])];
  } catch {
    return [[], []];
  }
}

export function writeForgeCoachHistory(
  onlineRoom: string | null,
  history: CoachHistory,
) {
  if (onlineRoom === "unavailable") return;
  try {
    const { storage, key } = historyStorage(onlineRoom);
    storage.setItem(key, JSON.stringify(history));
  } catch {
    // Advice remains available for this component's lifetime.
  }
}

export default function ForgeCoach({
  game,
  botTurn,
  onlineRoom = null,
}: {
  game: Game;
  botTurn: boolean;
  onlineRoom?: string | null;
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
  const history = useRef<CoachHistory>(readForgeCoachHistory(onlineRoom));
  useEffect(() => () => request.current?.abort(), []);
  async function ask() {
    if (busy || botTurn || game.phase === "end") return;
    const seat = game.turn;
    const player = seat + 1;
    setBusy(true);
    setResult(null);
    const controller = new AbortController();
    request.current = controller;
    try {
      const advice = await requestCoach(
        forgeCoachState(game, question, history.current[seat]),
        (answer) => setResult({ player, answer, error: false }),
        controller.signal,
      );
      history.current[seat] = [
        ...history.current[seat],
        { question, advice },
      ].slice(-3);
      writeForgeCoachHistory(onlineRoom, history.current);
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
            {result.error ? (
              <p>{result.answer}</p>
            ) : (
              <CoachAdvice advice={result.answer} />
            )}
            {!result.error && (
              <small>Based on the position when you asked.</small>
            )}
          </ForgeMessageDialog>
        )}
      </div>
    </section>
  );
}
