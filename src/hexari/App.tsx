import React, { useMemo, useState } from "react";
import BrandMark from "../shared/BrandMark";
import ForgeLink from "../shared/ForgeLink";
import {
  centers,
  decodeBoardConfig,
  defaultBoard,
  encodeBoardConfig,
  pips,
  placePalette,
  type PaletteSelection,
  resources,
  scoreVertex,
  swapTiles,
  swapNumbers,
  validateBoard,
  vertices,
  type Resource,
  type Strategy,
  type Tile,
  type Port,
  ports as defaultPorts,
} from "../shared/board";
import { balanceSeatDraft, simulateSeats } from "./engine/analysis";
import { rankSettlements } from "./engine/settlements";
import ThemeToggle from "../shared/ThemeToggle";
import PixiTerrain from "../shared/PixiLayer";
import { TerrainArt } from "../shared/TerrainArt";
import ForgeInvitation from "./ForgeInvitation";
import "./palette.css";

const colors: Record<Resource, string> = {
  wood: "#456e54",
  brick: "#b56e4f",
  wheat: "#d6ad5b",
  ore: "#788792",
  sheep: "#88a56d",
  desert: "#d2bd8b",
};
const labels: Record<Resource, string> = {
  wood: "Forest",
  brick: "Hills",
  wheat: "Fields",
  ore: "Mountains",
  sheep: "Pasture",
  desert: "Desert",
};
const scale = 45,
  ox = 240,
  oy = 185;
const point = (x: number, y: number) => `${ox + x * scale},${oy + y * scale}`;
function initialConfig() {
  try {
    return (
      decodeBoardConfig(location.hash.slice(1)) ??
      decodeBoardConfig(localStorage.getItem("hexari-board") ?? "") ?? {
        board: defaultBoard.map((t) => ({ ...t })),
        ports: defaultPorts.map((p) => ({ ...p })),
      }
    );
  } catch {
    return {
      board: defaultBoard.map((t) => ({ ...t })),
      ports: defaultPorts.map((p) => ({ ...p })),
    };
  }
}
export default function App() {
  const [initial] = useState(initialConfig);
  const [board, setBoard] = useState<Tile[]>(initial.board);
  const [boardPorts, setBoardPorts] = useState<Port[]>(initial.ports);
  React.useEffect(() => {
    const encoded = encodeBoardConfig({ board, ports: boardPorts });
    localStorage.setItem("hexari-board", encoded);
    if (location.hash)
      history.replaceState(null, "", `${location.pathname}#${encoded}`);
  }, [board, boardPorts]);
  const [pixiReady, setPixiReady] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [portEnd, setPortEnd] = useState<number | null>(null);
  const [tile, setTile] = useState<number | null>(null);
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [first, setFirst] = useState<number | undefined>();
  const [pins, setPins] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);
  const [swapTarget, setSwapTarget] = useState(0);
  const [boardMessage, setBoardMessage] = useState("");
  const [palette, setPalette] = useState<PaletteSelection | null>(null);
  const dragging = React.useRef<{
    from: number;
    x: number;
    y: number;
    kind: "tile" | "number";
  } | null>(null);
  const suppressClick = React.useRef(false);
  const boardSvg = React.useRef<SVGSVGElement>(null);
  const paletteDrag = React.useRef<{
    selection: PaletteSelection;
    x: number;
    y: number;
  } | null>(null);
  const suppressPaletteClick = React.useRef(false);
  const ranked = useMemo(
    () => rankSettlements(board, strategy, boardPorts, first),
    [board, strategy, first, boardPorts],
  );
  const current =
    selected === null ? null : (ranked.find((v) => v.id === selected) ?? null);
  const compared = pins
    .map((id) => ranked.find((v) => v.id === id)!)
    .filter(Boolean);
  const compareMetrics: {
    label: string;
    value: (v: (typeof ranked)[number]) => string;
  }[] = [
    { label: "Score", value: (v) => v.score.toFixed(1) },
    {
      label: "Rank",
      value: (v) =>
        v.rank === null ? "Unavailable" : `#${v.rank} / ${v.eligibleCount}`,
    },
    {
      label: "Percentile",
      value: (v) =>
        v.percentile === null ? "Unavailable" : `${v.percentile.toFixed(0)}%`,
    },
    { label: "Production", value: (v) => `${v.production} pips` },
    {
      label: "Expected production",
      value: (v) => `${v.expectedPerRoll.toFixed(2)} / roll`,
    },
    { label: "Resource types", value: (v) => String(v.unique) },
    {
      label: "Diversity bonus",
      value: (v) => `+${v.diversityBonus.toFixed(1)}`,
    },
    { label: "Scarcity bonus", value: (v) => `+${v.scarcity.toFixed(1)}` },
    { label: "Strategy bonus", value: (v) => `+${v.focus.toFixed(1)}` },
    {
      label: "New-resource bonus",
      value: (v) => `+${v.complement.toFixed(1)}`,
    },
    {
      label: "Port",
      value: (v) =>
        v.port === null
          ? "None"
          : `${v.port === "any" ? "Any" : v.port} ${v.portRate}:1`,
    },
    { label: "Port bonus", value: (v) => `+${v.portBonus.toFixed(1)}` },
    { label: "Eligible", value: (v) => (v.eligible ? "Yes" : "No") },
  ];
  const seatDraft = useMemo(
    () => simulateSeats(board, boardPorts),
    [board, boardPorts],
  );
  const currentPort =
    current &&
    boardPorts.find(
      (p) => p.vertex === current.id || p.otherVertex === current.id,
    );
  const existingPortEnd =
    currentPort?.otherVertex === undefined
      ? null
      : currentPort.vertex === current?.id
        ? currentPort.otherVertex
        : currentPort.vertex;
  const requestedPortEnd = portEnd ?? existingPortEnd;
  const validPortEnd =
    current &&
    requestedPortEnd !== null &&
    current.neighbors.includes(requestedPortEnd) &&
    vertices[requestedPortEnd].tiles.length < 3 &&
    current.tiles.filter((t) => vertices[requestedPortEnd].tiles.includes(t))
      .length === 1 &&
    !boardPorts.some(
      (p) =>
        p !== currentPort &&
        (p.vertex === requestedPortEnd || p.otherVertex === requestedPortEnd),
    )
      ? requestedPortEnd
      : null;
  const eligible = (id: number) =>
    first === undefined ||
    (first !== id && !vertices[first].neighbors.includes(id));
  function updateTile(change: Partial<Tile>) {
    if (tile === null) return;
    setBoard((b) => b.map((t, i) => (i === tile ? { ...t, ...change } : t)));
  }
  function swapBoardTiles(from: number, to: number) {
    if (from === to) return;
    setBoard((currentBoard) => swapTiles(currentBoard, from, to));
    setTile(to);
    setBoardMessage(`Swapped tile ${from + 1} with tile ${to + 1}.`);
  }
  function swapBoardNumbers(from: number, to: number) {
    if (from === to) return;
    if (
      board[from].number === null ||
      board[to].number === null ||
      board[from].resource === "desert" ||
      board[to].resource === "desert"
    ) {
      setBoardMessage(
        "Number tokens can only be swapped between producing tiles.",
      );
      return;
    }
    setBoard((currentBoard) => swapNumbers(currentBoard, from, to));
    setTile(to);
    setBoardMessage(
      `Swapped number tokens on tiles ${from + 1} and ${to + 1}.`,
    );
  }
  function placeOnTile(index: number, selection: PaletteSelection) {
    const next = placePalette(board, index, selection);
    if (next === board) {
      setBoardMessage("Number tokens cannot be placed on the desert.");
      return;
    }
    setBoard(next);
    setTile(index);
    setBoardMessage(
      selection.kind === "terrain"
        ? `${labels[selection.resource]} placed on tile ${index + 1}.`
        : `Number ${selection.number} placed on tile ${index + 1}.`,
    );
  }
  function startPaletteDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    selection: PaletteSelection,
  ) {
    if (event.button !== 0) return;
    paletteDrag.current = { selection, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function finishPaletteDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const start = paletteDrag.current;
    paletteDrag.current = null;
    if (
      !start ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8
    )
      return;
    suppressPaletteClick.current = true;
    const svg = boardSvg.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;
    const cursor = svg.createSVGPoint();
    cursor.x = event.clientX;
    cursor.y = event.clientY;
    const position = cursor.matrixTransform(matrix.inverse());
    const target = centers
      .map((center, index) => ({
        index,
        distance: Math.hypot(
          position.x - (ox + center.x * scale),
          position.y - (oy + center.y * scale),
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (target.distance < scale * 0.85) {
      setPalette(start.selection);
      placeOnTile(target.index, start.selection);
    } else setBoardMessage("Drop the piece on a board tile.");
  }
  function selectPalette(selection: PaletteSelection) {
    if (suppressPaletteClick.current) {
      suppressPaletteClick.current = false;
      return;
    }
    setPalette(selection);
  }
  async function share() {
    const url = `${location.origin}${location.pathname}#${encodeBoardConfig({ board, ports: boardPorts })}`;
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="shell">
      <ForgeInvitation />
      <main>
        <header className="topbar">
          <a className="brand" href="/" aria-label="Hexari home">
            <BrandMark />
            <span>
              hexari<small>BOARD INTELLIGENCE</small>
            </span>
          </a>
          <div className="top-actions">
            <ThemeToggle />
            <a
              className="top-link"
              href="/tools"
              aria-label="Strategy tools"
              title="Strategy tools"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" />
                <circle cx="9" cy="6" r="2" />
                <circle cx="15" cy="12" r="2" />
                <circle cx="10" cy="18" r="2" />
              </svg>
            </a>
            <button
              className="button ghost share-board-icon"
              type="button"
              onClick={share}
              aria-label={copied ? "Board link copied" : "Copy board link"}
              title={copied ? "Board link copied" : "Copy board link"}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                {copied ? (
                  <path d="m5 12 4 4L19 6" />
                ) : (
                  <>
                    <rect x="8" y="8" width="11" height="11" rx="2" />
                    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                  </>
                )}
              </svg>
            </button>
            <ForgeLink />
          </div>
        </header>
        <div className="content" id="workspace">
          <h1 className="sr-only">Board analyzer</h1>
          <div className="workspace">
            <section className="panel board-panel">
              <div className="panel-head">
                <div>
                  <div className="section-kicker">
                    01 &nbsp; / &nbsp; THE BOARD
                  </div>
                  <h2>Board</h2>
                  <p>
                    Drag terrain or a number token onto another tile to swap it.
                    Select a tile to edit it or a corner to inspect it.
                  </p>
                </div>
                <div className="detail-actions">
                  <button
                    className="button ghost compact"
                    onClick={() => {
                      if (validateBoard(board).length) {
                        setBoardMessage(
                          "Complete a valid board inventory before balancing.",
                        );
                        return;
                      }
                      const result = balanceSeatDraft(board, boardPorts, {
                        generateNew: true,
                      });
                      if (!result.reached) {
                        setBoardMessage(
                          `No new board reached the target after ${result.tried} attempts. Your board is unchanged; best simulated seat gap was ${result.gap.toFixed(1)} (target ${result.threshold}).`,
                        );
                        return;
                      }
                      setBoard(result.board);
                      setBoardMessage(
                        `New board generated: simulated seat score gap ${result.gap.toFixed(1)} (target ${result.threshold}). This does not guarantee equal outcomes.`,
                      );
                      setFirst(undefined);
                      setSelected(null);
                      setTile(null);
                    }}
                  >
                    ✦ Balance
                  </button>
                  <button
                    className="button ghost compact"
                    onClick={() => {
                      setBoard(defaultBoard.map((t) => ({ ...t })));
                      setBoardPorts(defaultPorts.map((p) => ({ ...p })));
                      setFirst(undefined);
                      setSelected(null);
                      setTile(null);
                      setPalette(null);
                      setBoardMessage("Board reset.");
                    }}
                  >
                    ↺ Reset
                  </button>
                </div>
              </div>
              {validateBoard(board).length > 0 && (
                <div className="board-warning" role="status">
                  Board inventory: {validateBoard(board).slice(0, 2).join(" ")}
                  {validateBoard(board).length > 2
                    ? ` +${validateBoard(board).length - 2} more`
                    : ""}
                </div>
              )}
              <section
                className="board-palette"
                aria-labelledby="board-pieces-label"
              >
                <h3 id="board-pieces-label">Board pieces</h3>
                <div>
                  <strong>Terrain</strong>
                  <span>Choose or drag a piece onto the board</span>
                </div>
                <div className="palette-items terrain-items">
                  {resources.map((resource) => (
                    <button
                      key={resource}
                      className={`palette-piece palette-terrain-card terrain-${resource} ${palette?.kind === "terrain" && palette.resource === resource ? "active" : ""}`}
                      aria-pressed={
                        palette?.kind === "terrain" &&
                        palette.resource === resource
                      }
                      onClick={() =>
                        selectPalette({ kind: "terrain", resource })
                      }
                      onPointerDown={(e) =>
                        startPaletteDrag(e, { kind: "terrain", resource })
                      }
                      onPointerUp={finishPaletteDrag}
                      onPointerCancel={() => {
                        paletteDrag.current = null;
                      }}
                    >
                      <svg
                        className="palette-terrain-icon"
                        viewBox="-18 -18 36 36"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <TerrainArt resource={resource} />
                      </svg>
                      <span>{labels[resource]}</span>
                    </button>
                  ))}
                </div>
                <div>
                  <strong>Numbers</strong>
                  <span>Select a number, then a producing tile</span>
                </div>
                <div className="palette-items palette-number-cards">
                  {Object.keys(pips).map((value) => {
                    const number = Number(value);
                    return (
                      <button
                        key={value}
                        className={`palette-piece number-piece ${palette?.kind === "number" && palette.number === number ? "active" : ""}`}
                        aria-label={`Number ${number}`}
                        aria-pressed={
                          palette?.kind === "number" &&
                          palette.number === number
                        }
                        onClick={() =>
                          selectPalette({ kind: "number", number })
                        }
                        onPointerDown={(e) =>
                          startPaletteDrag(e, { kind: "number", number })
                        }
                        onPointerUp={finishPaletteDrag}
                        onPointerCancel={() => {
                          paletteDrag.current = null;
                        }}
                      >
                        <span
                          className={`palette-number-face ${number === 6 || number === 8 ? "high-probability" : ""}`}
                        >
                          {number}
                        </span>
                        <span className="palette-pips" aria-hidden="true">
                          {"•".repeat(pips[number])}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    className="palette-clear"
                    onClick={() => setPalette(null)}
                  >
                    Clear selection
                  </button>
                </div>
              </section>
              <div className="board-wrap">
                <div className="board-top">
                  <span>
                    <i /> PRODUCTION MAP
                  </span>
                  <span>19 TILES · 54 CORNERS</span>
                </div>
                <div
                  className={`board-canvas-stack ${pixiReady ? "pixi-ready" : ""}`}
                >
                  <PixiTerrain
                    board={board}
                    selected={tile}
                    onReady={setPixiReady}
                  />
                  <svg
                    ref={boardSvg}
                    viewBox="0 0 480 370"
                    role="group"
                    aria-label="Hex board. Select a tile or corner for details."
                  >
                    <defs>
                      <linearGradient
                        id="analyzer-tile-light"
                        x1="0"
                        y1="0"
                        x2="0.4"
                        y2="1"
                      >
                        <stop
                          offset="0"
                          stopColor="#fff3cb"
                          stopOpacity=".25"
                        />
                        <stop
                          offset=".55"
                          stopColor="#fff3cb"
                          stopOpacity=".03"
                        />
                        <stop
                          offset="1"
                          stopColor="#142d28"
                          stopOpacity=".32"
                        />
                      </linearGradient>
                      <linearGradient
                        id="analyzer-token-face"
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
                      const t = board[i];
                      const points = Array.from({ length: 6 }, (_, j) => {
                        const a = ((60 * j - 30) * Math.PI) / 180;
                        return point(
                          c.x + Math.cos(a) * 0.96,
                          c.y + Math.sin(a) * 0.96,
                        );
                      }).join(" ");
                      return (
                        <g
                          key={i}
                          onClick={() => {
                            if (suppressClick.current) {
                              suppressClick.current = false;
                              return;
                            }
                            if (palette) placeOnTile(i, palette);
                            else setTile(i);
                          }}
                          onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            dragging.current = {
                              from: i,
                              x: event.clientX,
                              y: event.clientY,
                              kind:
                                event.target instanceof SVGElement &&
                                event.target.classList.contains("number-token")
                                  ? "number"
                                  : "tile",
                            };
                            event.currentTarget.setPointerCapture(
                              event.pointerId,
                            );
                          }}
                          onPointerUp={(event) => {
                            const start = dragging.current;
                            dragging.current = null;
                            if (
                              !start ||
                              Math.hypot(
                                event.clientX - start.x,
                                event.clientY - start.y,
                              ) < 8
                            )
                              return;
                            suppressClick.current = true;
                            const svg = event.currentTarget.ownerSVGElement;
                            const matrix = svg?.getScreenCTM();
                            if (!svg || !matrix) return;
                            const cursor = svg.createSVGPoint();
                            cursor.x = event.clientX;
                            cursor.y = event.clientY;
                            const position = cursor.matrixTransform(
                              matrix.inverse(),
                            );
                            const target = centers
                              .map((center, index) => ({
                                index,
                                distance: Math.hypot(
                                  position.x - (ox + center.x * scale),
                                  position.y - (oy + center.y * scale),
                                ),
                              }))
                              .sort((a, b) => a.distance - b.distance)[0];
                            if (target.distance < scale * 0.85) {
                              if (start.kind === "number")
                                swapBoardNumbers(start.from, target.index);
                              else swapBoardTiles(start.from, target.index);
                            } else
                              setBoardMessage(
                                "Drop on another tile to swap it.",
                              );
                          }}
                          onPointerCancel={() => {
                            dragging.current = null;
                          }}
                          className="tile"
                          role="button"
                          tabIndex={0}
                          aria-label={`Tile ${i + 1}, ${t.resource}, ${t.number ?? "no number"}`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (palette) placeOnTile(i, palette);
                              else setTile(i);
                            }
                          }}
                        >
                          <polygon
                            className="terrain-fill"
                            points={points}
                            fill={colors[t.resource]}
                            stroke={tile === i ? "#ffe8aa" : "#18262a"}
                            strokeWidth={tile === i ? 3 : 2}
                          />
                          <polygon
                            points={points}
                            fill="url(#analyzer-tile-light)"
                            stroke="#f1dfb4"
                            strokeOpacity=".38"
                            strokeWidth="2"
                            pointerEvents="none"
                          />
                          <polygon
                            points={Array.from({ length: 6 }, (_, j) => {
                              const a = ((60 * j - 30) * Math.PI) / 180;
                              return point(
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
                            transform={`translate(${ox + c.x * scale} ${oy + c.y * scale - 14})`}
                            aria-hidden="true"
                          >
                            <TerrainArt resource={t.resource} />
                          </g>
                          {t.number && (
                            <>
                              <circle
                                cx={ox + c.x * scale}
                                cy={oy + c.y * scale + 14}
                                r="14"
                                fill="#2d4439"
                                opacity=".3"
                                pointerEvents="none"
                              />
                              <circle
                                className="number-token"
                                cx={ox + c.x * scale}
                                cy={oy + c.y * scale + 12}
                                r="13"
                                fill="url(#analyzer-token-face)"
                                stroke="#9c895e"
                                strokeWidth="1"
                              />
                              <text
                                x={ox + c.x * scale}
                                y={oy + c.y * scale + 16}
                                textAnchor="middle"
                                className={
                                  t.number === 6 || t.number === 8
                                    ? "number hot"
                                    : "number"
                                }
                              >
                                {t.number}
                              </text>
                            </>
                          )}
                        </g>
                      );
                    })}
                    {vertices.map((v) => {
                      const production = scoreVertex(board, v).production;
                      return (
                        <circle
                          key={v.id}
                          cx={ox + v.x * scale}
                          cy={oy + v.y * scale}
                          r={selected === v.id ? 7 : 5}
                          fill={
                            eligible(v.id)
                              ? `hsl(${205 - Math.min(production, 15) * 11} 76% ${62 - production * 0.8}%)`
                              : "#4b5353"
                          }
                          stroke={
                            selected === v.id
                              ? "#fff"
                              : boardPorts.some(
                                    (p) =>
                                      p.vertex === v.id ||
                                      p.otherVertex === v.id,
                                  )
                                ? "#f5d17b"
                                : "#1e292b"
                          }
                          strokeWidth={
                            boardPorts.some(
                              (p) =>
                                p.vertex === v.id || p.otherVertex === v.id,
                            )
                              ? "3"
                              : "2"
                          }
                          role="button"
                          tabIndex={0}
                          aria-label={`Corner ${v.id + 1}, ${production} pips${boardPorts.some((p) => p.vertex === v.id || p.otherVertex === v.id) ? ", port access" : ""}${eligible(v.id) ? "" : " , unavailable"}`}
                          onClick={() => {
                            setSelected(v.id);
                            setPortEnd(null);
                            setTile(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelected(v.id);
                              setPortEnd(null);
                              setTile(null);
                            }
                          }}
                        />
                      );
                    })}
                  </svg>
                </div>
                <div className="legend">
                  <span>LOW PRODUCTION</span>
                  <div className="gradient" />
                  <span>HIGH PRODUCTION</span>
                </div>
              </div>
              {tile !== null && (
                <div className="editor">
                  <div>
                    <strong>Edit tile {tile + 1}</strong>
                    <small>Changes update every score instantly.</small>
                  </div>
                  <div className="tile-quick-choices" aria-label="Tile terrain">
                    <small>Terrain</small>
                    <div>
                      {resources.map((resource) => (
                        <button
                          key={resource}
                          type="button"
                          className={`palette-piece ${board[tile].resource === resource ? "active" : ""}`}
                          aria-pressed={board[tile].resource === resource}
                          onClick={() =>
                            updateTile({
                              resource,
                              number:
                                resource === "desert"
                                  ? null
                                  : (board[tile].number ?? 6),
                            })
                          }
                        >
                          <svg
                            className="palette-terrain-icon"
                            viewBox="-18 -18 36 36"
                            style={{ background: colors[resource] }}
                            aria-hidden="true"
                            focusable="false"
                          >
                            <TerrainArt resource={resource} />
                          </svg>
                          {labels[resource]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="tile-quick-choices" aria-label="Tile number">
                    <small>Number</small>
                    <div>
                      {Object.keys(pips).map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`palette-piece number-piece ${board[tile].number === Number(n) ? "active" : ""}`}
                          aria-pressed={board[tile].number === Number(n)}
                          disabled={board[tile].resource === "desert"}
                          onClick={() => updateTile({ number: Number(n) })}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    className="close"
                    onClick={() => setTile(null)}
                    aria-label="Close editor"
                  >
                    ×
                  </button>
                  <details className="tile-swap">
                    <summary>Swap with another tile</summary>
                    <label>
                      Swap with
                      <input
                        type="number"
                        min="1"
                        max="19"
                        aria-label="Swap with tile number"
                        value={swapTarget + 1}
                        onChange={(e) =>
                          setSwapTarget(
                            Math.max(
                              0,
                              Math.min(18, (Number(e.target.value) || 1) - 1),
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      className="button ghost"
                      disabled={tile === swapTarget}
                      onClick={() => swapBoardTiles(tile, swapTarget)}
                    >
                      Swap tiles
                    </button>
                    <button
                      className="button ghost"
                      disabled={
                        tile === swapTarget ||
                        board[tile].number === null ||
                        board[swapTarget].number === null
                      }
                      onClick={() => swapBoardNumbers(tile, swapTarget)}
                    >
                      Swap numbers
                    </button>
                  </details>
                </div>
              )}
              <p className="board-action-status" role="status">
                {boardMessage}
              </p>
              <div
                className="seat-balance"
                aria-label="Simulated four-player opening draft"
              >
                <div className="seat-balance-heading">
                  <strong>Opening balance</strong>
                  <span title="Scores simulate a four-player snake draft and estimate opening opportunity, not winning chances.">
                    Simulated draft
                  </span>
                </div>
                <div className="seat-balance-scores">
                  {seatDraft.map(({ seat, score, corners }) => (
                    <div
                      key={seat}
                      title={`Corners ${corners.map((id) => id + 1).join(" and ")}`}
                    >
                      <span>Seat {seat}</span>
                      <strong>{score.toFixed(1)}</strong>
                    </div>
                  ))}
                </div>
              </div>
              {(selected !== null || first !== undefined) && (
                <div className="board-footer">
                  <button
                    onClick={() => {
                      setFirst(undefined);
                      setSelected(null);
                    }}
                  >
                    Clear selection
                  </button>
                </div>
              )}
            </section>
            <section className="panel insights" id="insights">
              <div className="panel-head">
                <div>
                  <div className="section-kicker">
                    02 &nbsp; / &nbsp; OPENING STUDY
                  </div>
                  <h2>Settlement rankings</h2>
                  <p>The strongest corners, ranked for your strategy.</p>
                </div>
                <span className="spark">✳</span>
              </div>
              <fieldset className="strategy-selector">
                <legend>Strategy</legend>
                <div className="strategy-choices">
                  {(
                    [
                      {
                        value: "balanced",
                        label: "Balanced",
                        detail: "Varied resources",
                      },
                      {
                        value: "ore",
                        label: "Ore rush",
                        detail: "Ore and wheat",
                      },
                      {
                        value: "road",
                        label: "Road runner",
                        detail: "Wood and brick",
                      },
                      {
                        value: "port",
                        label: "Port trader",
                        detail: "Trading access",
                      },
                    ] as const
                  ).map((option) => (
                    <label
                      className={strategy === option.value ? "selected" : ""}
                      key={option.value}
                    >
                      <input
                        type="radio"
                        name="strategy"
                        value={option.value}
                        checked={strategy === option.value}
                        onChange={() => setStrategy(option.value)}
                      />
                      <span className="strategy-choice-copy">
                        <strong>{option.label}</strong>
                        <small>{option.detail}</small>
                      </span>
                      {strategy === option.value && (
                        <span className="strategy-check" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
              {first !== undefined && (
                <div className="first-notice">
                  First settlement: corner {first + 1}{" "}
                  <button onClick={() => setFirst(undefined)}>Clear</button>
                </div>
              )}
              {current ? (
                <div className="detail">
                  <div className="detail-title">
                    <div>
                      <small>SELECTED LOCATION</small>
                      <h3>Corner {current.id + 1}</h3>
                    </div>
                    <span>
                      {current.production} <small>PIPS</small>
                    </span>
                  </div>
                  <div className="adjacent-tiles" aria-label="Adjacent terrain">
                    {current.tiles.map((i) => {
                      const t = board[i];
                      return (
                        <div className="adjacent-tile" key={i}>
                          <svg
                            className={`resource-dot ${t.resource}`}
                            viewBox="-18 -18 36 36"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <TerrainArt resource={t.resource} />
                          </svg>
                          <span>
                            <strong>{labels[t.resource]}</strong>
                            <small>
                              {t.number
                                ? `Roll ${t.number} · ${pips[t.number]} pips`
                                : "No production"}
                            </small>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="metrics">
                    <div>
                      <small>SCORE</small>
                      <strong>{current.score.toFixed(1)}</strong>
                    </div>
                    <div>
                      <small>SCARCITY</small>
                      <strong>+{current.scarcity.toFixed(1)}</strong>
                    </div>
                    <div>
                      <small>PORT</small>
                      <strong>
                        {current.port
                          ? `${current.port} (+${current.portBonus.toFixed(1)})`
                          : "None"}
                      </strong>
                    </div>
                    <div>
                      <small>PRODUCTION</small>
                      <strong>{current.production} pips</strong>
                    </div>
                    <div>
                      <small>RESOURCE TYPES</small>
                      <strong>{current.unique} types</strong>
                    </div>
                    <div>
                      <small>DIVERSITY BONUS</small>
                      <strong>+{current.diversityBonus.toFixed(1)}</strong>
                    </div>
                    <div>
                      <small>
                        {first === undefined ? "BOARD RANK" : "ELIGIBLE RANK"}
                      </small>
                      <strong>
                        {current.rank === null
                          ? "Unavailable"
                          : `#${current.rank} / ${current.eligibleCount}`}
                      </strong>
                    </div>
                    <div>
                      <small>PERCENTILE</small>
                      <strong>
                        {current.percentile === null
                          ? "Unavailable"
                          : `${current.percentile.toFixed(0)}%`}
                      </strong>
                    </div>
                    <div>
                      <small>STRATEGY BONUS</small>
                      <strong>+{current.focus.toFixed(1)}</strong>
                    </div>
                    {first !== undefined && (
                      <div>
                        <small>NEW RESOURCES BONUS</small>
                        <strong>+{current.complement.toFixed(1)}</strong>
                      </div>
                    )}
                  </div>
                  {current.tiles.length < 3 && (
                    <fieldset className="port-editor">
                      <legend>Port access</legend>
                      <p>
                        Select the adjacent coastal corner, then the port type.
                        Both corners receive access.
                      </p>
                      <div
                        className="port-editor-options"
                        role="group"
                        aria-label="Other port corner"
                      >
                        {current.neighbors
                          .filter(
                            (id) =>
                              vertices[id].tiles.length < 3 &&
                              current.tiles.filter((t) =>
                                vertices[id].tiles.includes(t),
                              ).length === 1,
                          )
                          .map((id) => (
                            <button
                              key={id}
                              type="button"
                              className="button ghost compact"
                              aria-pressed={validPortEnd === id}
                              disabled={boardPorts.some(
                                (p) =>
                                  p !== currentPort &&
                                  (p.vertex === id || p.otherVertex === id),
                              )}
                              title={
                                boardPorts.some(
                                  (p) =>
                                    p !== currentPort &&
                                    (p.vertex === id || p.otherVertex === id),
                                )
                                  ? "This corner already has a port"
                                  : undefined
                              }
                              onClick={() => setPortEnd(id)}
                            >
                              Corner {id + 1}
                            </button>
                          ))}
                      </div>
                      <div className="port-editor-options">
                        {(
                          [
                            "none",
                            "any",
                            "wood",
                            "brick",
                            "wheat",
                            "ore",
                            "sheep",
                          ] as const
                        ).map((resource) => (
                          <button
                            key={resource}
                            type="button"
                            className="button ghost compact"
                            disabled={
                              resource !== "none" && validPortEnd === null
                            }
                            aria-pressed={
                              (boardPorts.find(
                                (p) =>
                                  p.vertex === current.id ||
                                  p.otherVertex === current.id,
                              )?.resource ?? "none") === resource
                            }
                            onClick={() =>
                              setBoardPorts((previous) => {
                                const others = previous.filter(
                                  (p) =>
                                    p.vertex !== current.id &&
                                    p.otherVertex !== current.id &&
                                    (resource === "none" ||
                                      (p.vertex !== validPortEnd &&
                                        p.otherVertex !== validPortEnd)),
                                );
                                return resource === "none" ||
                                  validPortEnd === null
                                  ? others
                                  : [
                                      ...others,
                                      {
                                        vertex: current.id,
                                        otherVertex: validPortEnd,
                                        resource,
                                        rate: resource === "any" ? 3 : 2,
                                      },
                                    ];
                              })
                            }
                          >
                            {resource === "none"
                              ? "None"
                              : resource === "any"
                                ? "3:1"
                                : `${resource} 2:1`}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <div className="detail-actions">
                    <button
                      className="button primary"
                      disabled={!eligible(current.id)}
                      onClick={() => setFirst(current.id)}
                    >
                      Set first settlement
                    </button>
                    <button
                      className="button ghost"
                      disabled={pins.length >= 3 && !pins.includes(current.id)}
                      aria-describedby={
                        pins.length >= 3 ? "compare-limit" : undefined
                      }
                      onClick={() =>
                        setPins((p) =>
                          p.includes(current.id)
                            ? p.filter((x) => x !== current.id)
                            : p.length < 3
                              ? [...p, current.id]
                              : p,
                        )
                      }
                    >
                      {pins.includes(current.id) ? "Unpin" : "＋ Compare"}
                    </button>
                  </div>
                  {pins.length >= 3 && (
                    <p className="hint" id="compare-limit" role="status">
                      You can compare up to three corners. Remove one to add
                      another.
                    </p>
                  )}
                </div>
              ) : (
                <div className="empty">
                  <span>⌖</span>
                  <div>
                    <strong>Inspect a corner</strong>
                    <p>
                      Select a corner on the map or choose one from the ranking.
                    </p>
                  </div>
                </div>
              )}
              <details className="ranking-disclosure" open>
                <summary className="list-title">
                  <span>TOP CORNERS</span>
                  <span>SCORE</span>
                </summary>
                <div className="ranking">
                  {ranked
                    .filter((v) => eligible(v.id))
                    .slice(0, 10)
                    .map((v) => (
                      <button
                        className={`rank ${selected === v.id ? "selected" : ""}`}
                        key={v.id}
                        onClick={() => {
                          setSelected(v.id);
                          setPortEnd(null);
                          setTile(null);
                        }}
                      >
                        <span className="rank-number">
                          {String(v.rank).padStart(2, "0")}
                        </span>
                        <span className="rank-info">
                          <strong>Corner {v.id + 1}</strong>
                          <small>
                            {v.tiles
                              .map((t) => board[t].resource)
                              .filter((r) => r !== "desert")
                              .join(" · ") || "Desert"}
                          </small>
                        </span>
                        <span className="rank-score">
                          {v.score.toFixed(1)} <small>↗</small>
                        </span>
                      </button>
                    ))}
                </div>
              </details>
            </section>
          </div>
          {pins.length > 0 && (
            <section className="panel compare">
              <div className="section-kicker">SIDE BY SIDE</div>
              <h2>Compare corners</h2>
              <p className="compare-caption">
                Scores compare opening potential, not chances of winning.
              </p>
              {compared.length > 1 && (
                <p className="compare-scroll-hint">
                  Swipe sideways to see all corners.
                </p>
              )}
              <div className="compare-table-wrap">
                <table className="compare-table">
                  <caption className="sr-only">
                    Comparison of pinned corners
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Metric</th>
                      {compared.map((v) => (
                        <th scope="col" key={v.id}>
                          Corner {v.id + 1}
                          <button
                            type="button"
                            aria-label={`Remove corner ${v.id + 1} from comparison`}
                            onClick={() =>
                              setPins((p) => p.filter((id) => id !== v.id))
                            }
                          >
                            ×
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compareMetrics.map((metric) => (
                      <tr key={metric.label}>
                        <th scope="row">{metric.label}</th>
                        {compared.map((v) => (
                          <td key={v.id}>{metric.value(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <footer>HEXARI</footer>
        </div>
      </main>
    </div>
  );
}
