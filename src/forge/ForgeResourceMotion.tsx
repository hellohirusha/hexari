import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { TerrainArt } from "../shared/TerrainArt";
import type { ResourceTransfer } from "./resourceTransfers";

type Flight = ResourceTransfer & {
  key: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  delay: number;
};

/** Animate only public, confirmed resource movements. */
export function useResourceMotion(viewer: 0 | 1) {
  const viewerRef = useRef(viewer);
  useEffect(() => {
    viewerRef.current = viewer;
  }, [viewer]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const nextFlight = useRef(0);
  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const timer of activeTimers) clearTimeout(timer);
      activeTimers.clear();
    };
  }, []);

  const show = useCallback((transfers: ResourceTransfer[]) => {
    const point = (location: ResourceTransfer["from"]) => {
      const selector =
        location === "bank"
          ? ".forge-bank"
          : location === viewerRef.current
            ? ".forge-hand-cards"
            : `[data-forge-seat="${location}"]`;
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : null;
    };
    let outgoingCount = 0;
    let incomingCount = 0;
    const hasBankPayment = transfers.some((transfer) => transfer.to === "bank");
    const next = transfers.flatMap((transfer) => {
      const from = point(transfer.from),
        to = point(transfer.to);
      if (!from || !to || transfer.amount <= 0) return [];
      return Array.from({ length: transfer.amount }, () => {
        const isBankReceipt = transfer.from === "bank" && hasBankPayment;
        const delay = isBankReceipt
          ? 850 + incomingCount++ * 70
          : outgoingCount++ * 70;
        return {
          ...transfer,
          amount: 1,
          key: String(nextFlight.current++),
          x: from.x,
          y: from.y,
          dx: to.x - from.x,
          dy: to.y - from.y,
          delay,
        };
      });
    });
    if (!next.length) return;
    setFlights((current) => [...current, ...next]);
    const keys = new Set(next.map((flight) => flight.key));
    const timer = setTimeout(
      () => {
        setFlights((current) =>
          current.filter((flight) => !keys.has(flight.key)),
        );
        timers.current.delete(timer);
      },
      Math.max(...next.map((flight) => flight.delay)) + 1000,
    );
    timers.current.add(timer);
  }, []);

  const overlay = flights.length
    ? createPortal(
        <div className="forge-resource-flights" aria-hidden="true">
          {flights.map((flight) => (
            <div
              key={flight.key}
              className={`forge-resource-flight forge-bank-${flight.resource}`}
              style={
                {
                  left: flight.x,
                  top: flight.y,
                  "--flight-x": `${flight.dx}px`,
                  "--flight-y": `${flight.dy}px`,
                  animationDelay: `${flight.delay}ms`,
                } as CSSProperties
              }
            >
              <svg viewBox="-20 -20 40 40">
                <TerrainArt resource={flight.resource} />
              </svg>
            </div>
          ))}
        </div>,
        document.body,
      )
    : null;
  return { show, overlay };
}
