import { vertices } from "./board";
import { BuildingArt, TerrainArt } from "../shared/TerrainArt";
import { useEffect, useLayoutEffect, useRef } from "react";
import { positionBuildPopover } from "./popoverPosition";
import { watchOutsideBuildPopover } from "./outsideBuildPopover";
import {
  canAfford,
  legalRoad,
  legalSettlement,
  legalSetupSettlement,
  costs,
  type Building,
  type Game,
  type Goods,
} from "./engine";

type Build = Building;
type Target = { at: number; to?: number };
type Choice = {
  building: Build;
  at: number;
  to?: number;
  cost: Partial<Record<Goods, number>>;
  label: string;
};

/** A small board-oriented cue distinguishes roads offered from one corner. */
function roadDirection(from: number, to: number): string {
  const a = vertices[from];
  const b = vertices[to];
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const directions = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
  return directions[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
}

export default function ForgeBuildPopover({
  game,
  target,
  onBuild,
  onClose,
  selectedBuilding,
}: {
  game: Game;
  target: Target;
  onBuild: (building: Build, at: number, to?: number) => void;
  onClose: (restoreFocus?: boolean) => void;
  selectedBuilding?: Building | null;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const v = vertices[target.at];
  const other = target.to === undefined ? null : vertices[target.to];
  const x = other ? (v.x + other.x) / 2 : v.x;
  const y = other ? (v.y + other.y) / 2 : v.y;
  const choices: Choice[] = [];
  if (game.phase === "setup" && !other && legalSetupSettlement(game, v.id))
    choices.push({
      building: "settlement",
      at: v.id,
      cost: {},
      label: "Starting settlement",
    });
  if (game.phase === "build" && other && legalRoad(game, v.id, other.id))
    choices.push({
      building: "road",
      at: v.id,
      to: other.id,
      cost: costs.road,
      label: "Road",
    });
  if (game.phase === "build" && !other && legalSettlement(game, v.id))
    choices.push({
      building: "settlement",
      at: v.id,
      cost: costs.settlement,
      label: "Settlement",
    });
  if (
    game.phase === "build" &&
    !other &&
    game.players[game.turn].settlements.includes(v.id)
  )
    choices.push({
      building: "city",
      at: v.id,
      cost: costs.city,
      label: "City",
    });
  if (game.phase === "build" && !other)
    v.neighbors
      .filter((id) => legalRoad(game, v.id, id))
      .forEach((id) =>
        choices.push({
          building: "road",
          at: v.id,
          to: id,
          cost: costs.road,
          label: `Road to ${id + 1}`,
        }),
      );
  const visibleChoices = choices.filter(
    (choice) => !selectedBuilding || choice.building === selectedBuilding,
  );
  useLayoutEffect(() => {
    const popup = popoverRef.current;
    const board = popup?.parentElement;
    if (!popup || !board) return;
    const update = () => {
      const width = board.clientWidth;
      const height = board.clientHeight;
      if (!width || !height) return;
      const scale =
        Number.parseFloat(
          getComputedStyle(board).getPropertyValue("--forge-tile-scale"),
        ) || 1;
      const position = positionBuildPopover(
        { width, height },
        { width: popup.offsetWidth, height: popup.offsetHeight },
        {
          x: (0.5 + (x * 45 * scale) / 640) * width,
          y: (0.5 + (y * 45 * scale) / 530) * height,
        },
      );
      popup.style.left = `${position.left}px`;
      popup.style.top = `${position.top}px`;
      popup.style.visibility = "visible";
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(board);
    observer.observe(popup);
    return () => observer.disconnect();
  }, [x, y, choices.length]);
  useLayoutEffect(() => {
    const popup = popoverRef.current;
    const initial = popup?.querySelector<HTMLButtonElement>(
      ".forge-context-choice:not(:disabled)",
    );
    (initial ?? popup)?.focus();
  }, [target.at, target.to]);
  useEffect(() => {
    const popup = popoverRef.current;
    if (!popup) return;
    return watchOutsideBuildPopover(
      popup.ownerDocument,
      popup,
      popup.parentElement,
      () => onClose(false),
    );
  }, [onClose]);
  return (
    <div
      ref={popoverRef}
      className="forge-build-popover"
      role="group"
      aria-label="Build options"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {visibleChoices.length === 0 && (
        <span className="forge-build-empty" role="status">
          No builds available here.
        </span>
      )}
      {visibleChoices.map((choice) => {
        const affordable = canAfford(game.players[game.turn].hand, choice.cost);
        const costLabel =
          Object.entries(choice.cost)
            .map(([resource, amount]) => `${amount} ${resource}`)
            .join(", ") || "free";
        return (
          <button
            key={`${choice.building}-${choice.to ?? choice.at}`}
            type="button"
            className="forge-context-choice"
            aria-label={`${choice.label}, ${costLabel}${affordable ? "" : ", not enough resources"}`}
            title={`${choice.label}: ${costLabel}${affordable ? "" : " - not enough resources"}`}
            disabled={!affordable}
            onClick={() => onBuild(choice.building, choice.at, choice.to)}
          >
            {choice.building === "road" &&
              choice.to !== undefined &&
              !other && (
                <span className="forge-road-direction" aria-hidden="true">
                  {roadDirection(choice.at, choice.to)}
                </span>
              )}
            <svg
              className="forge-context-illustration"
              viewBox="-16 -16 32 32"
              aria-hidden="true"
            >
              {choice.building === "road" ? (
                <g
                  transform={`rotate(${choice.to === undefined ? 0 : (Math.atan2(vertices[choice.to].y - v.y, vertices[choice.to].x - v.x) * 180) / Math.PI})`}
                >
                  <rect
                    x="-11"
                    y="-4"
                    width="22"
                    height="8"
                    rx="2"
                    fill="#ba8958"
                    stroke="#f1d5a2"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M-7-3v6m5-6v6m5-6v6"
                    stroke="#6e4c34"
                    strokeWidth="1"
                  />
                  {target.to === undefined && (
                    <path
                      d="m7-2 3 2-3 2"
                      fill="none"
                      stroke="#fff2cf"
                      strokeWidth="1.4"
                    />
                  )}
                </g>
              ) : (
                <BuildingArt
                  city={choice.building === "city"}
                  owner={game.turn}
                />
              )}
            </svg>
            <span className="forge-context-cost" aria-hidden="true">
              {Object.entries(choice.cost).length === 0 ? (
                <span>Free</span>
              ) : (
                Object.entries(choice.cost).map(([resource, amount]) => (
                  <span
                    key={resource}
                    className={
                      game.players[game.turn].hand[resource as Goods] < amount!
                        ? "forge-cost-short"
                        : undefined
                    }
                  >
                    <svg viewBox="-20 -20 40 40" className="forge-cost-icon">
                      <TerrainArt resource={resource as Goods} />
                    </svg>
                    <span>{amount}</span>
                  </span>
                ))
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
