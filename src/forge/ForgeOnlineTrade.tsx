import { useState } from "react";
import { type Game, type Goods } from "./engine";
import { TradeCards } from "./ForgeMarket";
import { TerrainArt } from "../shared/TerrainArt";
import type { OnlineCommand, Seat, TradeOffer } from "./online/session";

export default function ForgeOnlineTrade({
  game,
  seat,
  offer,
  disabled,
  onCommand,
}: {
  game: Game;
  seat: Seat;
  offer: TradeOffer | null;
  disabled: boolean;
  onCommand: (command: OnlineCommand) => void;
}) {
  const [give, setGive] = useState<Goods | null>(null);
  const [receive, setReceive] = useState<Goods | null>(null);
  const [offerWasPending, setOfferWasPending] = useState(offer !== null);
  const offerIsPending = offer !== null;
  if (offerWasPending !== offerIsPending) {
    setOfferWasPending(offerIsPending);
    if (!offerIsPending) {
      setGive(null);
      setReceive(null);
    }
  }
  if (game.phase !== "build") return null;
  if (offer)
    return (
      <section
        className="forge-side-card forge-market-section forge-online-trade forge-online-trade-offer"
        aria-label="Online trade"
        aria-live="polite"
      >
        <p>
          {offer.by === seat
            ? "Waiting for the other player"
            : `Player ${offer.by + 1} offers:`}
        </p>
        <div
          className="forge-trade-preview"
          role="group"
          aria-label={`Give ${offer.by === seat ? offer.give : offer.receive} and receive ${offer.by === seat ? offer.receive : offer.give}`}
        >
          {[
            {
              resource: offer.by === seat ? offer.give : offer.receive,
              label: "Give",
            },
            {
              resource: offer.by === seat ? offer.receive : offer.give,
              label: "Receive",
            },
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
        {offer.by !== seat && (
          <div className="forge-online-trade-actions">
            <button
              type="button"
              className="button primary"
              disabled={disabled || game.players[seat].hand[offer.receive] < 1}
              onClick={() => onCommand({ type: "accept" })}
            >
              Accept
            </button>
            <button
              type="button"
              className="button ghost"
              disabled={disabled}
              onClick={() => onCommand({ type: "decline" })}
            >
              Decline
            </button>
          </div>
        )}
      </section>
    );
  if (game.turn !== seat) return null;
  return (
    <section
      className="forge-side-card forge-market-section forge-online-trade"
      aria-label="Online trade"
    >
      <h3 className="forge-market-heading">
        Trade <span>with player</span>
      </h3>
      <TradeCards
        label="Give"
        selected={give}
        disabled={(resource) =>
          disabled || game.players[seat].hand[resource] < 1
        }
        onSelect={(resource) => {
          setGive(give === resource ? null : resource);
          if (receive === resource) setReceive(null);
        }}
      />
      <TradeCards
        label="Receive"
        selected={receive}
        disabled={(resource) => disabled || resource === give}
        onSelect={(resource) =>
          setReceive(receive === resource ? null : resource)
        }
      >
        <button
          type="button"
          className="market-submit"
          aria-label="Offer trade"
          title="Offer trade"
          disabled={
            disabled ||
            !give ||
            !receive ||
            give === receive ||
            game.players[seat].hand[give] < 1
          }
          onClick={() => {
            if (give && receive) onCommand({ type: "offer", give, receive });
          }}
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
    </section>
  );
}
