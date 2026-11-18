import { vertices } from "./board";
import { BuildingArt } from "../shared/TerrainArt";
import { useLayoutEffect, useRef } from "react";
import { positionBuildPopover } from "./popoverPosition";
import {
  canAfford,
  legalRoad,
  legalSettlement,
  legalImprovement,
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
  onClose: () => void;
  selectedBuilding?: Building | null;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const v = vertices[target.at];
  const other = target.to === undefined ? null : vertices[target.to];
  const x = other ? (v.x + other.x) / 2 : v.x;
  const y = other ? (v.y + other.y) / 2 : v.y;
  const choices: Choice[] = [];
  if (other && legalRoad(game, v.id, other.id))
    choices.push({
      building: "road",
      at: v.id,
      to: other.id,
      cost: { wood: 1, brick: 1 },
      label: "Road",
    });
  if (!other && legalSettlement(game, v.id))
    choices.push({
      building: "settlement",
      at: v.id,
      cost: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
      label: "Settlement",
    });
  if (!other && game.players[game.turn].settlements.includes(v.id))
    choices.push({
      building: "city",
      at: v.id,
      cost: { wheat: 2, ore: 3 },
      label: "City",
    });
  if (!other)
    for (const building of ["farm", "market"] as const) {
      if (legalImprovement(game, building, v.id))
        choices.push({
          building,
          at: v.id,
          cost: costs[building],
          label:
            building === "farm"
              ? "Farm: extra wheat on matching rolls"
              : "Market: bank trades at 3 to 1",
        });
    }
  if (!other)
    v.neighbors
      .filter((id) => legalRoad(game, v.id, id))
      .forEach((id) =>
        choices.push({
          building: "road",
          at: v.id,
          to: id,
          cost: { wood: 1, brick: 1 },
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
  return (
    <div
      ref={popoverRef}
      className="forge-build-popover"
      role="group"
      aria-label="Build options"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      {visibleChoices.length === 0 && (
        <span className="sr-only">No builds available here.</span>
      )}
      {visibleChoices.map((choice) => (
        <button
          key={`${choice.building}-${choice.to ?? choice.at}`}
          type="button"
          className="forge-context-choice"
          aria-label={`${choice.label}, ${Object.entries(choice.cost)
            .map(([resource, amount]) => `${amount} ${resource}`)
            .join(", ")}`}
          title={`${choice.label}: ${Object.entries(choice.cost)
            .map(([resource, amount]) => `${amount} ${resource}`)
            .join(", ")}`}
          disabled={!canAfford(game.players[game.turn].hand, choice.cost)}
          onClick={() => onBuild(choice.building, choice.at, choice.to)}
        >
          <svg viewBox="-16 -16 32 32" aria-hidden="true">
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
            ) : choice.building === "farm" || choice.building === "market" ? (
              <text x="0" y="7" textAnchor="middle" fontSize="20">
                {choice.building === "farm" ? "🌾" : "⚖"}
              </text>
            ) : (
              <BuildingArt
                city={choice.building === "city"}
                owner={game.turn}
              />
            )}
          </svg>
        </button>
      ))}
      <button
        type="button"
        className="forge-build-close"
        aria-label="Close build options"
        title="Close"
        onClick={onClose}
        autoFocus
      >
        ×
      </button>
    </div>
  );
}
