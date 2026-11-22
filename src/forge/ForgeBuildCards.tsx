import { BuildingArt } from "../shared/TerrainArt";
import { buildKinds, buildOptions } from "./buildOptions";
import { costs, type Building, type Game } from "./engine";

export default function ForgeBuildCards({
  game,
  botTurn,
  selected,
  onSelect,
}: {
  game: Game;
  botTurn: boolean;
  selected: Building | null;
  onSelect: (building: Building) => void;
}) {
  return (
    <div className="forge-build-cards" role="group" aria-label="Buildings">
      {buildKinds.map((building) => {
        const option = buildOptions(game, building);
        const enabled = option.available && !botTurn;
        const cost = Object.entries(costs[building])
          .map(([resource, amount]) => `${amount} ${resource}`)
          .join(", ");
        const name = building[0].toUpperCase() + building.slice(1);
        const reason = botTurn
          ? "Opponent's turn"
          : game.phase === "setup"
            ? "Place your starting settlement first"
            : game.phase !== "build"
              ? "Roll first"
              : !option.affordable
                ? "Not enough resources"
                : !enabled
                  ? "No legal placement"
                  : "Choose a location";
        return (
          <button
            key={building}
            type="button"
            className="forge-build-card"
            disabled={!enabled}
            aria-pressed={selected === building}
            aria-label={`${name}. ${cost}. ${reason}.`}
            title={`${name}: ${cost}. ${reason}.`}
            onClick={() => onSelect(building)}
          >
            <svg viewBox="-16 -16 32 32" aria-hidden="true">
              {building === "road" ? (
                <g transform="rotate(-35)">
                  <rect
                    x="-3"
                    y="-13"
                    width="6"
                    height="26"
                    rx="1"
                    fill="#cb9d67"
                    stroke="#f4dcb0"
                    strokeWidth="1.5"
                  />
                </g>
              ) : (
                <BuildingArt city={building === "city"} owner={game.turn} />
              )}
            </svg>
          </button>
        );
      })}
    </div>
  );
}
