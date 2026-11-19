import { useState, type ReactNode } from "react";
import { bankRate, goods, type Game, type Goods } from "./engine";
import type { Cue } from "./sound";
import { TerrainArt } from "../shared/TerrainArt";

export function botAcceptsTrade(game: Game, give: Goods, receive: Goods) {
  const bot = game.players[1];
  return bot.hand[receive] > 0 && bot.hand[give] <= bot.hand[receive];
}

function TradeCards({
  label,
  selected,
  disabled,
  onSelect,
  children,
}: {
  label: string;
  selected: Goods | null;
  disabled: (resource: Goods) => boolean;
  onSelect: (resource: Goods) => void;
  children?: ReactNode;
}) {
  return (
    <div className="forge-trade-row" role="group" aria-label={label}>
      <span className="forge-trade-row-label">{label}</span>
      <div className="forge-trade-cards">
        {goods.map((resource) => (
          <button
            key={resource}
            type="button"
            className={`forge-bank-card forge-bank-${resource}${selected === resource ? " selected" : ""}`}
            aria-label={`${label} ${resource}`}
            aria-pressed={selected === resource}
            title={`${label} ${resource}`}
            disabled={disabled(resource)}
            onClick={() => onSelect(resource)}
          >
            <svg viewBox="-20 -20 40 40" aria-hidden="true">
              <TerrainArt resource={resource} />
            </svg>
            {selected === resource && (
              <span className="forge-bank-count" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        ))}
        {children}
      </div>
    </div>
  );
}

export default function ForgeMarket({
  game,
  bot,
  onBank,
  onTrade,
  onCue,
  hideTrade = false,
}: {
  game: Game;
  bot: boolean;
  onBank: (give: Goods, receive: Goods) => void;
  onTrade: (give: Goods, receive: Goods) => boolean;
  onCue: (cue: Cue) => void;
  hideTrade?: boolean;
}) {
  const [give, setGive] = useState<Goods | null>(null),
    [receive, setReceive] = useState<Goods | null>(null),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [bankGive, setBankGive] = useState<Goods | null>(null);
  const hand = game.players[game.turn].hand;
  const rate = bankRate(game.players[game.turn]);
  const selectedBankGive =
    game.phase === "build" && bankGive && hand[bankGive] >= rate
      ? bankGive
      : null;
  const tradeReady =
    game.phase === "build" &&
    give !== null &&
    receive !== null &&
    give !== receive &&
    hand[give] > 0;
  function submit() {
    if (!tradeReady || !give || !receive) return;
    if (!bot) {
      onCue("select");
      setMessage("");
      setPending(true);
      return;
    }
    if (!botAcceptsTrade(game, give, receive) || !onTrade(give, receive)) {
      onCue("blocked");
      setMessage("The bot declined this offer.");
      return;
    }
    setMessage("The bot accepted the trade.");
    setGive(null);
    setReceive(null);
  }
  return (
    <div className="forge-market">
      <div
        className="forge-bank forge-side-card"
        role="group"
        aria-label={`Bank exchange, ${rate} cards for one`}
      >
        <div className="forge-bank-symbol" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path
              d="M3 11h26L16 4 3 11Zm2 3h22M4 27h24M7 14v10m6-10v10m6-10v10m6-10v10M5 25h22"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <span>{rate}:1</span>
        </div>
        {goods.map((resource) => {
          const selected = selectedBankGive === resource;
          const disabled =
            game.phase !== "build" ||
            (!selectedBankGive && hand[resource] < rate);
          const label = selected
            ? `Cancel giving ${rate} ${resource}`
            : selectedBankGive
              ? `Exchange ${rate} ${selectedBankGive} for one ${resource}`
              : `Give ${rate} ${resource} to the bank`;
          return (
            <button
              key={resource}
              type="button"
              className={`forge-bank-card forge-bank-${resource}${selected ? " selected" : ""}`}
              disabled={disabled}
              aria-label={label}
              aria-pressed={selected}
              title={label}
              onClick={() => {
                if (selected) {
                  setBankGive(null);
                  onCue("select");
                  return;
                }
                if (!selectedBankGive) {
                  setBankGive(resource);
                  onCue(resource);
                  return;
                }
                onBank(selectedBankGive, resource);
                setBankGive(null);
              }}
            >
              <svg viewBox="-20 -20 40 40" aria-hidden="true">
                <TerrainArt resource={resource} />
              </svg>
              {selected && (
                <span className="forge-bank-count" aria-hidden="true">
                  −{rate}
                </span>
              )}
            </button>
          );
        })}
        <span className="sr-only" role="status">
          {selectedBankGive
            ? `Choose a resource to receive for ${rate} ${selectedBankGive}.`
            : game.phase !== "build"
              ? "Roll before exchanging with the bank."
              : `Select a resource you have at least ${rate} of to exchange.`}
        </span>
      </div>
      {!hideTrade && game.phase === "build" && (
        <section
          className="forge-market-section forge-side-card"
          aria-labelledby="forge-trade-heading"
        >
          <h3 id="forge-trade-heading" className="forge-market-heading">
            Trade <span>{bot ? "with bot" : "with player"}</span>
          </h3>
          {pending && give && receive ? (
            <div className="forge-trade-review">
              <strong>Player {2 - game.turn}: accept?</strong>
              <div
                className="forge-trade-preview"
                aria-label={`Give ${receive} and receive ${give}`}
              >
                {[
                  { resource: receive, label: "Give" },
                  { resource: give, label: "Receive" },
                ].map(({ resource, label }) => (
                  <div key={label}>
                    <span>{label}</span>
                    <div
                      className={`forge-bank-card forge-bank-${resource} forge-trade-preview-card`}
                    >
                      <svg viewBox="-20 -20 40 40" aria-hidden="true">
                        <TerrainArt resource={resource} />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <button
                  className="market-choice"
                  onClick={() => {
                    if (onTrade(give, receive)) {
                      setMessage("Trade accepted.");
                      setGive(null);
                      setReceive(null);
                    } else
                      setMessage(
                        "Trade unavailable. One player does not have the offered card.",
                      );
                    setPending(false);
                  }}
                >
                  Accept
                </button>
                <button
                  className="market-choice"
                  onClick={() => {
                    setPending(false);
                    setMessage("Trade declined.");
                    onCue("blocked");
                  }}
                >
                  Decline
                </button>
              </div>
            </div>
          ) : (
            <>
              <TradeCards
                label="Give"
                selected={give}
                disabled={(g) => hand[g] < 1}
                onSelect={(g) => {
                  setGive(give === g ? null : g);
                  if (receive === g) setReceive(null);
                  setMessage("");
                  onCue(g);
                }}
              />
              <TradeCards
                label="Receive"
                selected={receive}
                disabled={(g) => g === give}
                onSelect={(g) => {
                  setReceive(receive === g ? null : g);
                  setMessage("");
                  onCue(g);
                }}
              >
                <button
                  className="market-submit"
                  type="button"
                  aria-label="Offer trade"
                  title="Offer trade"
                  disabled={!tradeReady}
                  onClick={submit}
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
              </TradeCards>
            </>
          )}
          {message && <p role="status">{message}</p>}
        </section>
      )}
    </div>
  );
}
