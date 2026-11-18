import {
  useState,
  useRef,
  type Dispatch,
  type SetStateAction,
  type DragEvent,
  type PointerEvent,
} from "react";
import type { Port, Tile } from "../shared/board";
import { TerrainArt } from "../shared/TerrainArt";
import { emptyHand, goods, type Goods, type Hand } from "../shared/resources";
import { parseCorners } from "./engine/liveTracker";
import {
  evaluateTrade,
  getBankRates,
  type TradeGoal,
} from "./engine/tradeCalculator";
import "./tradeCalculator.css";

type Props = {
  board: Tile[];
  boardPorts: Port[];
  hand: Hand;
  setHand: Dispatch<SetStateAction<Hand>>;
};
const goals: { value: TradeGoal; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "road", label: "Road" },
  { value: "settlement", label: "Settlement" },
  { value: "city", label: "City" },
  { value: "development", label: "Development card" },
];

export default function TradeCalculator({
  board,
  boardPorts,
  hand,
  setHand,
}: Props) {
  const [give, setGive] = useState<Hand>(emptyHand);
  const [receive, setReceive] = useState<Hand>(emptyHand);
  const [settlementText, setSettlementText] = useState("");
  const [cityText, setCityText] = useState("");
  const [goal, setGoal] = useState<TradeGoal>("balanced");
  const pointerDrag = useRef<{
    source: string;
    resource: Goods;
    x: number;
    y: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const settlements = parseCorners(settlementText);
  const cities = parseCorners(cityText);
  const corners = [...(settlements ?? []), ...(cities ?? [])];
  const validCorners =
    settlements !== null &&
    cities !== null &&
    new Set(corners).size === corners.length;
  const bankRates = getBankRates(boardPorts, validCorners ? corners : [], 4);
  const result = evaluateTrade({
    board,
    hand,
    give,
    receive,
    settlements: validCorners ? settlements : [],
    cities: validCorners ? cities : [],
    goal,
    bankRates,
  });
  const adjust = (
    set: Dispatch<SetStateAction<Hand>>,
    resource: Goods,
    delta: number,
    limit = 99,
  ) =>
    set((previous) => ({
      ...previous,
      [resource]: Math.min(limit, Math.max(0, previous[resource] + delta)),
    }));
  const changeHand = (resource: Goods, delta: number) => {
    const next = Math.max(0, Math.min(99, hand[resource] + delta));
    setHand((previous) => ({ ...previous, [resource]: next }));
    setGive((previous) => ({
      ...previous,
      [resource]: Math.min(previous[resource], next),
    }));
  };
  const moveCard = (
    source: string,
    item: Goods,
    target: string | undefined,
  ) => {
    if (target === "give" && source === "hand")
      adjust(setGive, item, 1, hand[item]);
    if (target === "hand" && source === "give") adjust(setGive, item, -1);
    if (target === "receive" && source === "supply")
      adjust(setReceive, item, 1);
  };
  const startPointerDrag = (
    event: PointerEvent<HTMLButtonElement>,
    source: string,
    resource: Goods,
  ) => {
    if (event.button !== 0) return;
    pointerDrag.current = {
      source,
      resource,
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const endPointerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const start = pointerDrag.current;
    pointerDrag.current = null;
    if (
      !start ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8
    )
      return;
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-trade-drop]");
    moveCard(start.source, start.resource, target?.dataset.tradeDrop);
  };
  const clickCard = (action: () => void) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    action();
  };
  const drop = (event: DragEvent, target: "give" | "hand" | "receive") => {
    event.preventDefault();
    const [prefix, source, resource] = event.dataTransfer
      .getData("text/plain")
      .split(":");
    if (prefix !== "hexari" || !goods.includes(resource as Goods)) return;
    const item = resource as Goods;
    moveCard(source, item, target);
  };
  const allowDrop = (event: DragEvent) => event.preventDefault();
  const art = (resource: Goods) => (
    <svg viewBox="-18 -20 36 40" aria-hidden="true">
      <TerrainArt resource={resource} />
    </svg>
  );
  return (
    <div className="tool-panel trade-calculator">
      <div className="section-kicker">TRADE CALCULATOR</div>
      <h2>Trade calculator</h2>
      <p>
        Set your hand and placements, then build an offer. Click or drag cards.
      </p>
      <div className="trade-context">
        <label>
          Settlements{" "}
          <input
            value={settlementText}
            onChange={(e) => setSettlementText(e.target.value)}
            placeholder="Corner numbers, e.g. 3, 12"
          />
        </label>
        <label>
          Cities{" "}
          <input
            value={cityText}
            onChange={(e) => setCityText(e.target.value)}
            placeholder="Corner numbers"
          />
        </label>
      </div>
      {!validCorners && (
        <p role="alert">Enter distinct corner numbers from 1 to 54.</p>
      )}
      <fieldset className="trade-goals">
        <legend>Goal</legend>
        <div>
          {goals.map((item) => (
            <label key={item.value}>
              <input
                type="radio"
                name="trade-goal"
                checked={goal === item.value}
                onChange={() => setGoal(item.value)}
              />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>
      <section
        className="trade-zone"
        data-trade-drop="hand"
        onDragOver={allowDrop}
        onDrop={(event) => drop(event, "hand")}
      >
        <h3>Your hand</h3>
        <div className="trade-resource-row">
          {goods.map((g) => (
            <div className={`trade-resource trade-resource-${g}`} key={g}>
              <button
                type="button"
                onPointerDown={(event) => startPointerDrag(event, "hand", g)}
                onPointerUp={endPointerDrag}
                onPointerCancel={() => {
                  pointerDrag.current = null;
                }}
                onClick={() => clickCard(() => adjust(setGive, g, 1, hand[g]))}
                aria-label={`Add ${g} to offer`}
              >
                {art(g)}
                <span>{g}</span>
                <strong>{hand[g]}</strong>
              </button>
              <div className="trade-stepper">
                <button
                  type="button"
                  onClick={() => changeHand(g, -1)}
                  aria-label={`Remove ${g} from hand`}
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => changeHand(g, 1)}
                  aria-label={`Add ${g} to hand`}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <div className="trade-offers">
        <section
          className="trade-zone"
          data-trade-drop="give"
          onDragOver={allowDrop}
          onDrop={(event) => drop(event, "give")}
        >
          <h3>I give</h3>
          <p>Drag from your hand or tap a card.</p>
          <div className="trade-resource-row">
            {goods
              .filter((g) => give[g] > 0)
              .map((g) => (
                <button
                  className={`trade-offer-card trade-resource-${g}`}
                  type="button"
                  key={g}
                  onPointerDown={(event) => startPointerDrag(event, "give", g)}
                  onPointerUp={endPointerDrag}
                  onPointerCancel={() => {
                    pointerDrag.current = null;
                  }}
                  onClick={() => clickCard(() => adjust(setGive, g, -1))}
                  aria-label={`Remove one ${g} from offer`}
                >
                  {art(g)}
                  <span>
                    {g} × {give[g]}
                  </span>
                </button>
              ))}
            {goods.every((g) => !give[g]) && (
              <span className="trade-empty">No cards offered</span>
            )}
          </div>
        </section>
        <section
          className="trade-zone"
          data-trade-drop="receive"
          onDragOver={allowDrop}
          onDrop={(event) => drop(event, "receive")}
        >
          <h3>I receive</h3>
          <p>Tap or drag a resource into this area.</p>
          <div className="trade-resource-row">
            {goods.map((g) => (
              <div className={`trade-resource trade-resource-${g}`} key={g}>
                <button
                  type="button"
                  onPointerDown={(event) =>
                    startPointerDrag(event, "supply", g)
                  }
                  onPointerUp={endPointerDrag}
                  onPointerCancel={() => {
                    pointerDrag.current = null;
                  }}
                  onClick={() => clickCard(() => adjust(setReceive, g, 1))}
                  aria-label={`Request one ${g}`}
                >
                  {art(g)}
                  <span>{g}</span>
                  <strong>{receive[g]}</strong>
                </button>
                <div className="trade-stepper">
                  <button
                    type="button"
                    onClick={() => adjust(setReceive, g, -1)}
                    aria-label={`Remove requested ${g}`}
                  >
                    -
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="trade-bank">
        <strong>Bank rates</strong>
        <span>{goods.map((g) => `${g} ${bankRates[g]}:1`).join(" · ")}</span>
      </div>
      <div className="result-card" aria-live="polite">
        <small>
          {result.hasPersonal
            ? "YOUR PRODUCTION AND GOAL"
            : "BOARD-WIDE ESTIMATE"}
        </small>
        <h3>
          {result.invalid
            ? "Check your offer"
            : result.ready && validCorners
              ? result.verdict
              : "Add cards on both sides"}
        </h3>
        {result.invalid ? (
          <p>
            Do not offer more than your hand or exchange the same resource for
            itself.
          </p>
        ) : result.ready && validCorners ? (
          <>
            <p>
              Based on{" "}
              {result.hasPersonal ? "your production" : "board production"} and
              your goal, the requested cards have{" "}
              {Math.round(result.ratio * 100)}% of the estimated value of the
              cards you give.
            </p>
            <p>
              {result.bankCanMatch
                ? "The bank can match this offer using the selected cards, if stock is available."
                : "The bank cannot match this offer using only the selected cards."}
            </p>
            {result.bankEquivalent && (
              <p>
                Bank cost for the requested cards: {result.bankEquivalent.cards}{" "}
                {result.bankEquivalent.resource}, subject to bank stock.
              </p>
            )}
            {goal !== "balanced" && (
              <p>
                Cards needed for your goal: {result.deficitBefore} before,{" "}
                {result.deficitAfter} after.
              </p>
            )}
            {result.fairRanges.length > 0 && (
              <p>
                Comparable offer{" "}
                {result.fairRanges.length > 1
                  ? "ranges, changing one resource at a time"
                  : "range"}
                :{" "}
                {result.fairRanges
                  .map((range) =>
                    range.min <= range.max
                      ? `${range.min}-${range.max} ${range.resource}`
                      : `no whole-card range for ${range.resource}`,
                  )
                  .join("; ")}
                . Other offered cards stay fixed. This is a heuristic, not a
                prediction of another player's decision.
              </p>
            )}
          </>
        ) : (
          <p>Enter your placements for personal production and port rates.</p>
        )}
      </div>
    </div>
  );
}
