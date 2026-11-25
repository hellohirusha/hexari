import InlineChoices from "../shared/InlineChoices";
import LiveTracker from "./LiveTracker";
import TradeCalculator from "./TradeCalculator";
import ThemeToggle from "../shared/ThemeToggle";
import BrandMark from "../shared/BrandMark";
import ForgeLink from "../shared/ForgeLink";
import { TerrainArt } from "../shared/TerrainArt";
import { useEffect, useMemo, useState } from "react";
import {
  decodeBoard,
  decodeBoardConfig,
  defaultBoard,
  encodeBoard,
  encodeBoardConfig,
  scoreVertex,
  vertices,
  type Tile,
  ports as defaultPorts,
  validateBoard,
} from "../shared/board";
import {
  production,
  simulateSeats,
  shuffledBoard,
  strategyOpportunities,
  mistakeExamples,
  regionalOpenings,
} from "./engine/analysis";
import { simulateStrategyDistribution } from "./engine/strategySimulation";
import { emptyHand, goods, type Hand } from "../shared/resources";
import { requestCoach } from "../shared/coachClient";
import CoachAdvice from "../shared/CoachAdvice";
import {
  readCoachHistory,
  writeCoachHistory,
  type CoachEntry,
} from "./coachHistory";
const keys = ["wood", "brick", "wheat", "ore", "sheep"] as const;
function initial() {
  try {
    return (
      decodeBoard(location.hash.slice(1)) ??
      decodeBoard(localStorage.getItem("hexari-board") ?? "") ??
      defaultBoard
    );
  } catch {
    return defaultBoard;
  }
}
const mistakes = [
  "Ignoring resource diversity",
  "Chasing pips without a plan",
  "Overlooking wheat",
  "Ignoring access to expansion",
  "Trading without a goal",
  "Building roads with no destination",
  "Failing to watch opponents",
  "Ignoring port access",
  "Holding too many cards",
  "Confusing past rolls with future probability",
];
export default function Companion() {
  const [boardPorts, setBoardPorts] = useState(() => {
    try {
      return (
        decodeBoardConfig(location.hash.slice(1))?.ports ??
        decodeBoardConfig(localStorage.getItem("hexari-board") ?? "")?.ports ??
        defaultPorts
      );
    } catch {
      return defaultPorts;
    }
  });
  const [board, setBoard] = useState<Tile[]>(initial),
    [turn, setTurn] = useState(1),
    [vp, setVp] = useState(2),
    [buildings, setBuildings] = useState(""),
    [opponents, setOpponents] = useState(""),
    [question, setQuestion] = useState("What should I build?"),
    [hand, setHand] = useState<Hand>(emptyHand),
    [answer, setAnswer] = useState(""),
    [coachError, setCoachError] = useState(false),
    [coachHistory, setCoachHistory] = useState<CoachEntry[]>(readCoachHistory),
    [busy, setBusy] = useState(false);
  const [settlementText, setSettlementText] = useState("");
  const [cityText, setCityText] = useState("");
  const [tradePositionVersion, setTradePositionVersion] = useState(0);
  const coachBoardKey = encodeBoardConfig({ board, ports: boardPorts });
  const legacyCoachBoardKey = encodeBoard(board);
  const defaultPortLayout =
    JSON.stringify(boardPorts) === JSON.stringify(defaultPorts);
  const matchesCoachBoard = (entry: CoachEntry) =>
    entry.board === coachBoardKey ||
    (defaultPortLayout && entry.board === legacyCoachBoardKey);
  useEffect(() => {
    writeCoachHistory(coachHistory);
  }, [coachHistory]);
  useEffect(() => {
    function onBoardChanged(event: StorageEvent) {
      if (event.key !== "hexari-board" || !event.newValue) return;
      const config = decodeBoardConfig(event.newValue);
      if (!config) return;
      setBoard(config.board);
      setBoardPorts(config.ports);
      if (location.hash)
        history.replaceState(
          null,
          "",
          `${location.pathname}#${event.newValue}`,
        );
    }
    window.addEventListener("storage", onBoardChanged);
    return () => window.removeEventListener("storage", onBoardChanged);
  }, []);
  const rates = useMemo(() => production(board), [board]);
  const examples = useMemo(
    () => mistakeExamples(board, boardPorts),
    [board, boardPorts],
  );
  const boardProblems = useMemo(() => validateBoard(board), [board]);
  const distribution = useMemo(
    () =>
      boardProblems.length
        ? null
        : simulateStrategyDistribution(board, boardPorts),
    [board, boardPorts, boardProblems],
  );
  const regions = useMemo(() => regionalOpenings(board), [board]);
  function saveBoard(b: Tile[]) {
    setBoard(b);
    const encoded = encodeBoardConfig({ board: b, ports: boardPorts });
    localStorage.setItem("hexari-board", encoded);
    history.replaceState(null, "", `#${encoded}`);
  }
  async function coach() {
    setBusy(true);
    setAnswer("");
    setCoachError(false);
    try {
      const advice = await requestCoach(
        {
          board,
          ports: boardPorts,
          turn,
          vp,
          hand,
          buildings,
          opponents,
          question,
          history: coachHistory
            .filter(matchesCoachBoard)
            .slice(-3)
            .map(({ question, advice }) => ({
              question,
              advice: advice.slice(0, 600),
            })),
        },
        setAnswer,
      );
      setAnswer(advice);
      setCoachHistory((previous) =>
        [
          ...previous,
          {
            board: coachBoardKey,
            question,
            advice,
          },
        ].slice(-12),
      );
    } catch (e) {
      setCoachError(true);
      setAnswer(e instanceof Error ? e.message : "Coach unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="tools-page">
      <header className="topbar">
        <div className="workspace-header-brand">
          <a
            className="workspace-back"
            href="/"
            aria-label="Back to board analyzer"
            title="Back to board analyzer"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
            </svg>
          </a>
          <a className="brand" href="/" aria-label="Hexari home">
            <BrandMark />
            <span>
              hexari<small>BOARD INTELLIGENCE</small>
            </span>
          </a>
        </div>
        <div className="top-actions">
          <ThemeToggle />
          <ForgeLink />
        </div>
      </header>
      <div className="tools-content">
        <h1 className="sr-only">Strategy tools</h1>
        <div className="tools-sections">
          <section className="panel tools-section" aria-label="Tracker">
            <div className="tool-panel">
              <div className="section-kicker">LIVE TRACKER</div>
              <LiveTracker
                board={board}
                boardPorts={boardPorts}
                onUsePosition={(position) => {
                  setSettlementText(position.settlements);
                  setCityText(position.cities);
                  if (position.hand) setHand(position.hand);
                  setTradePositionVersion((version) => version + 1);
                  setTurn(position.turn);
                  setBuildings(
                    `Settlements: ${position.settlements || "none"}; cities: ${position.cities || "none"}`,
                  );
                  setOpponents(position.opponents);
                }}
              />
            </div>
          </section>
          <section
            className="panel tools-section"
            aria-label="Trade calculator"
          >
            <TradeCalculator
              key={tradePositionVersion}
              board={board}
              boardPorts={boardPorts}
              hand={hand}
              setHand={setHand}
              settlementText={settlementText}
              setSettlementText={setSettlementText}
              cityText={cityText}
              setCityText={setCityText}
            />
          </section>
          <section className="panel tools-section" aria-label="AI coach">
            <div className="tool-panel">
              <div className="section-kicker">AI GAME COACH</div>
              <h2>AI coach</h2>
              <p>
                Provide the visible situation. Advice is generated by a
                configured server-side model and may be wrong.
              </p>
              <div className="coach-grid">
                <fieldset className="choice-field coach-question">
                  <legend>Question</legend>
                  <InlineChoices
                    aria-label="Question"
                    value={question}
                    onChange={(value) => setQuestion(value)}
                  >
                    {[
                      "What should I build?",
                      "Should I accept this trade?",
                      "How do I catch up?",
                      "What is my winning line?",
                    ].map((q) => (
                      <option key={q}>{q}</option>
                    ))}
                  </InlineChoices>
                </fieldset>
                <label>
                  Turn
                  <input
                    type="number"
                    min="1"
                    value={turn}
                    onChange={(e) => setTurn(Number(e.target.value))}
                  />
                </label>
                <label>
                  Victory points
                  <input
                    type="number"
                    min="0"
                    value={vp}
                    onChange={(e) => setVp(Number(e.target.value))}
                  />
                </label>
                <label>
                  Your buildings
                  <textarea
                    value={buildings}
                    onChange={(e) => setBuildings(e.target.value)}
                    placeholder="Locations, roads, and ports"
                  />
                </label>
                <label>
                  Opponents and offer
                  <textarea
                    value={opponents}
                    onChange={(e) => setOpponents(e.target.value)}
                    placeholder="Visible buildings, points, and trade details"
                  />
                </label>
              </div>
              <div className="field-label">YOUR HAND</div>
              <div className="hand coach-hand">
                {keys.map((g) => (
                  <label key={g}>
                    {g}
                    <input
                      type="number"
                      min="0"
                      value={hand[g]}
                      onChange={(e) =>
                        setHand((h) => ({
                          ...h,
                          [g]: Math.max(0, Number(e.target.value)),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                className="button primary"
                disabled={busy}
                onClick={coach}
              >
                {busy ? "Thinking..." : "Get advice"}
              </button>
              {answer && (
                <div className="result-card">
                  <small>COACH RESPONSE</small>
                  {coachError ? (
                    <p>{answer}</p>
                  ) : (
                    <CoachAdvice advice={answer} />
                  )}
                </div>
              )}
              {coachHistory.some(matchesCoachBoard) && (
                <div className="result-card">
                  <small>RECENT COACHING FOR THIS BOARD</small>
                  {coachHistory
                    .filter(matchesCoachBoard)
                    .slice(-3)
                    .reverse()
                    .map((entry, index) => (
                      <div key={`${entry.question}-${index}`}>
                        <strong>{entry.question}</strong>
                        <CoachAdvice advice={entry.advice} />
                      </div>
                    ))}
                  <button
                    className="button ghost"
                    onClick={() => {
                      setCoachHistory((previous) =>
                        previous.filter((entry) => !matchesCoachBoard(entry)),
                      );
                      setAnswer("");
                    }}
                  >
                    Clear board history
                  </button>
                  <p className="hint">
                    Stored on this device. The last three entries for this board
                    are sent with your next request.
                  </p>
                </div>
              )}
            </div>
          </section>
          <section className="panel tools-section" aria-label="Board stats">
            <div className="tool-panel">
              <div className="section-kicker">BOARD STATS</div>
              <h2>Board stats</h2>
              <p>
                Expected matching tiles per roll across the board. Actual card
                income depends on buildings, the robber, and the bank.
              </p>
              <div className="distribution">
                {goods.map((g) => (
                  <div key={g}>
                    <span>{g}</span>
                    <strong>{rates[g].toFixed(2)}</strong>
                    <small>tiles per roll</small>
                  </div>
                ))}
              </div>
              <div className="field-label">OPENING STRATEGY SIGNALS</div>
              <p>
                Best relevant production at one corner, measured in pips out of
                15. For a specific port, only its resource counts; for a generic
                port, all resources count. These signals compare opening access,
                not predicted wins or a complete strategy.
              </p>
              <div className="region-grid">
                {strategyOpportunities(board, boardPorts).map((item) => (
                  <div className="region-card" key={item.id}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.pips} / 15 pips</span>
                    </div>
                    <div className="region-track">
                      <div style={{ width: `${item.score * 100}%` }} />
                    </div>
                    <small>
                      {item.corner === null
                        ? "No port placed"
                        : `Corner ${item.corner + 1}`}
                    </small>
                  </div>
                ))}
              </div>
              <div className="field-label">QUADRANT OPENING HEATMAP</div>
              <p>
                Best two non-adjacent corners within each quadrant, by
                production. Regions are evaluated independently, so these are
                not player seats.
              </p>
              <p className="stats-evenness">
                <strong>
                  Opening evenness:{" "}
                  {Math.round(
                    100 *
                      (1 -
                        (Math.max(...regions.map((region) => region.pips)) -
                          Math.min(...regions.map((region) => region.pips))) /
                          30),
                  )}
                  %
                </strong>
                <span>
                  {" "}
                  Based on the gap between the highest and lowest quadrant
                  totals.
                </span>
              </p>
              <div
                className="stats-heatmap"
                aria-label="Opening production by quadrant"
              >
                {regions.map((region) => (
                  <div
                    className="stats-heat-cell"
                    key={region.region}
                    style={
                      {
                        "--heat": Math.max(0, Math.min(1, region.pips / 30)),
                      } as React.CSSProperties
                    }
                  >
                    <strong>{region.region}</strong>
                    <span>{region.pips} / 30 pips</span>
                    <small>
                      {region.corners
                        ? `Corners ${region.corners[0] + 1} and ${region.corners[1] + 1}`
                        : "No valid pair"}
                    </small>
                  </div>
                ))}
              </div>
              <div className="field-label">SIMULATED STRATEGY RACE</div>
              <p>
                A simplified race to five points across up to 24 shuffled
                versions of this board. Four strategies rotate seats; terrain
                and number pairs stay together and ports stay fixed. The bars
                show model outcomes, not real-world win rates.
              </p>
              {distribution ? (
                <div
                  className="stats-simulation"
                  aria-label="Simulated strategy race results"
                >
                  {(
                    [
                      ["ore", "Ore and wheat"],
                      ["road", "Wood and brick"],
                      ["port", "Port trading"],
                      ["balanced", "Balanced"],
                    ] as const
                  ).map(([id, label]) => {
                    const wins = distribution.wins[id];
                    const percentage = distribution.games
                      ? (100 * wins) / distribution.games
                      : 0;
                    return (
                      <div className="stats-simulation-row" key={id}>
                        <span>{label}</span>
                        <div className="region-track">
                          <div style={{ width: `${percentage}%` }} />
                        </div>
                        <strong>
                          {distribution.games
                            ? `${percentage.toFixed(1)}%`
                            : "-"}
                        </strong>
                        <small>
                          {wins} of {distribution.games}
                        </small>
                      </div>
                    );
                  })}
                  <small>
                    {distribution.unfinished} of {distribution.games} races
                    unfinished after {distribution.maxTurns} rolls. Seed{" "}
                    {distribution.seed}.
                  </small>
                  {distribution.skippedBoards > 0 && (
                    <small>
                      {distribution.skippedBoards} board samples skipped because
                      a valid layout was not found.
                    </small>
                  )}
                  <p className="hint">
                    The model uses draft scores, second-settlement starting
                    resources, dice, bank trades, cities and simplified
                    expansion. It omits the robber, player trades, development
                    cards and road connectivity. It models a finite bank and
                    production shortages. Each strategy follows fixed
                    priorities. These {distribution.games} races are a small
                    sample.
                  </p>
                </div>
              ) : (
                <p className="hint">
                  Complete a valid standard board to run the simulation.
                </p>
              )}
              <div className="field-label">SIMULATED SEAT OPPORTUNITY</div>
              <p>
                Four seats choose in snake-draft order using the same scoring
                model. This is a simulation, not a prediction of real players'
                choices.
              </p>
              <div className="region-grid">
                {simulateSeats(board, boardPorts).map((item) => (
                  <div className="region-card" key={item.seat}>
                    <div>
                      <strong>Seat {item.seat}</strong>
                      <span>{item.score.toFixed(1)} score</span>
                    </div>
                    <div className="region-track">
                      <div
                        style={{
                          width: `${Math.max(0, Math.min(100, (item.score / 50) * 100))}%`,
                        }}
                      />
                    </div>
                    <small>
                      {item.corners.length === 2
                        ? `Corners ${item.corners[0] + 1} and ${item.corners[1] + 1}`
                        : "No valid pair"}
                    </small>
                  </div>
                ))}
              </div>
              <div className="field-label">EXAMPLE OPENING OPPORTUNITIES</div>
              <p>
                {vertices
                  .map((v) => ({
                    id: v.id,
                    score: scoreVertex(board, v).production,
                  }))
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 3)
                  .map((v) => `Corner ${v.id + 1}: ${v.score} pips`)
                  .join(" · ")}
              </p>
              <button
                className="button ghost"
                onClick={() => saveBoard(shuffledBoard(board))}
              >
                Shuffle board
              </button>
              <h2 className="mistake-title">Ten mistakes to avoid</h2>
              <div className="mistakes">
                {mistakes.map((m, i) => (
                  <div key={m}>
                    <small>{String(i + 1).padStart(2, "0")}</small>
                    <strong>{m}</strong>
                    <span
                      className="mistake-terrain"
                      role="img"
                      aria-label={vertices[examples[i].corner].tiles
                        .map(
                          (id) =>
                            `${board[id].resource}${board[id].number === null ? "" : `, ${board[id].number}`}`,
                        )
                        .join("; ")}
                    >
                      {vertices[examples[i].corner].tiles.map((id) => (
                        <span className="mistake-tile" key={id}>
                          <svg viewBox="-18 -20 36 40">
                            <TerrainArt resource={board[id].resource} />
                          </svg>
                          <small>{board[id].number ?? "-"}</small>
                        </span>
                      ))}
                    </span>
                    <p>{examples[i].example}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
