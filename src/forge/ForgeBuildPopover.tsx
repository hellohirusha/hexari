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
  legalSetupRoad,
  remainingPieces,
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
  onClose: (restoreFocus?: boolean) => void;
  selectedBuilding?: Building | null;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const v = vertices[target.at];
  const other = target.to === undefined ? null : vertices[target.to];
  const x = other ? (v.x + other.x) / 2 : v.x;
  const y = other ? (v.y + other.y) / 2 : v.y;
  const choices: Choice[] = [];
  const player = game.players[game.turn];
  const previewOwnBuilding =
    game.phase === "roll" &&
    !other &&
    (player.settlements.includes(v.id) || player.cities.includes(v.id));
  const showBuildingChoices = game.phase === "build" || previewOwnBuilding;
  if (game.phase === "setup" && !other && legalSetupSettlement(game, v.id))
    choices.push({
      building: "settlement",
      at: v.id,
      cost: {},
      label: "Starting settlement",
    });
  if (game.phase === "setup" && other && legalSetupRoad(game, v.id, other.id))
    choices.push({
      building: "road",
      at: v.id,
      to: other.id,
      cost: {},
      label: "Starting road",
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
    showBuildingChoices &&
    !other &&
    player.settlements.includes(v.id) &&
    remainingPieces(player, "city") > 0
  )
    choices.push({
      building: "city",
      at: v.id,
      cost: costs.city,
      label: "City",
    });
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
          x: (0.5 + (x * 45 * scale) / 470) * width,
          y: (0.5 + (y * 45 * scale) / 390) * height,
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
        const affordable = canAfford(player.hand, choice.cost);
        const rollFirst = game.phase === "roll";
        const unavailable = rollFirst
          ? "roll first"
          : affordable
            ? ""
            : "not enough resources";
        const costLabel = Object.entries(choice.cost)
          .map(([resource, amount]) => `${amount} ${resource}`)
          .join(", ");
        return (
          <button
            key={`${choice.building}-${choice.to ?? choice.at}`}
            type="button"
            className="forge-context-choice"
            aria-label={`${choice.label}${costLabel ? `, ${costLabel}` : ""}${unavailable ? `, ${unavailable}` : ""}`}
            title={`${choice.label}${costLabel ? `: ${costLabel}` : ""}${unavailable ? ` - ${unavailable}` : ""}`}
            disabled={!affordable || rollFirst}
            onClick={() => onBuild(choice.building, choice.at, choice.to)}
          >
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
            {Object.entries(choice.cost).length > 0 && (
              <span className="forge-context-cost" aria-hidden="true">
                {Object.entries(choice.cost).map(([resource, amount]) => (
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
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
