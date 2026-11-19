import { useState } from "react";
import { goods, type Game, type Goods } from "./engine";
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
  const [give, setGive] = useState<Goods>("wood");
  const [receive, setReceive] = useState<Goods>("brick");
  if (game.phase !== "build") return null;
  if (offer)
    return (
      <section
        className="forge-side-card forge-market-section"
        aria-label="Online trade"
      >
        {offer.by === seat ? (
          <p>Waiting for the other player to answer your offer.</p>
        ) : (
          <>
            <p>
              Player {offer.by + 1} offers 1 {offer.give} for your 1{" "}
              {offer.receive}.
            </p>
            <button
              type="button"
              className="market-choice"
              disabled={disabled || game.players[seat].hand[offer.receive] < 1}
              onClick={() => onCommand({ type: "accept" })}
            >
              Accept
            </button>{" "}
            <button
              type="button"
              className="market-choice"
              disabled={disabled}
              onClick={() => onCommand({ type: "decline" })}
            >
              Decline
            </button>
          </>
        )}
      </section>
    );
  if (game.turn !== seat) return null;
  return (
    <section
      className="forge-side-card forge-market-section"
      aria-label="Online trade"
    >
      <h3>Offer a trade</h3>
      <label>
        Give{" "}
        <select
          value={give}
          onChange={(event) => setGive(event.target.value as Goods)}
        >
          {goods.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>{" "}
      <label>
        Receive{" "}
        <select
          value={receive}
          onChange={(event) => setReceive(event.target.value as Goods)}
        >
          {goods.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>{" "}
      <button
        type="button"
        className="market-choice"
        disabled={
          disabled || give === receive || game.players[seat].hand[give] < 1
        }
        onClick={() => onCommand({ type: "offer", give, receive })}
      >
        Offer
      </button>
    </section>
  );
}
