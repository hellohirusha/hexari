import { useEffect, useRef, useState } from "react";
import { BuildingArt, TerrainArt } from "../shared/TerrainArt";
import "./ForgeGuide.css";

const topics = [
  "The goal",
  "Starting out",
  "Dice and resources",
  "Building",
  "Bank and hand",
  "Turns and timer",
  "FAQ",
] as const;

export default function ForgeGuide() {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [open]);
  return (
    <section className="forge-guide" aria-label="Forge guide">
      <button
        type="button"
        className="button ghost forge-guide-toggle"
        aria-label={open ? "Close guide" : "How to play"}
        title={open ? "Close guide" : "How to play"}
        aria-expanded={open}
        aria-controls="forge-guide-content"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5ZM4 18a2.5 2.5 0 0 1 2.5-2H20M8 7h8M8 10h8" />
        </svg>
      </button>
      {open && (
        <dialog
          ref={dialog}
          id="forge-guide-content"
          className="panel forge-guide-panel"
          aria-labelledby="forge-guide-title"
          onCancel={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
        >
          <div className="forge-guide-header">
            <div>
              <span className="section-kicker">THE FORGE FIELD GUIDE</span>
              <h2 id="forge-guide-title">Learn the game</h2>
            </div>
            <p>Your turn timer keeps running while the guide is open.</p>
            <button
              type="button"
              className="forge-guide-close"
              aria-label="Close guide"
              title="Close guide"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="forge-guide-layout">
            <nav className="forge-guide-nav" aria-label="Guide topics">
              {topics.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={topic === index ? "active" : ""}
                  aria-current={topic === index ? "step" : undefined}
                  onClick={() => setTopic(index)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {label}
                </button>
              ))}
            </nav>
            <div className="forge-guide-content" aria-live="polite">
              <div className="forge-guide-chapter">
                CHAPTER {String(topic + 1).padStart(2, "0")} /{" "}
                {String(topics.length).padStart(2, "0")}
              </div>
              <h3>{topics[topic]}</h3>
              {topic === 0 && (
                <>
                  <p>
                    Race to <strong>5 victory points</strong>. Build settlements
                    and upgrade them to cities.
                  </p>
                  <div className="guide-illustrations">
                    <div>
                      <svg viewBox="-18 -18 36 36" aria-hidden="true">
                        <BuildingArt city={false} owner={0} />
                      </svg>
                      <strong>Settlement</strong>
                      <span>1 point</span>
                    </div>
                    <div>
                      <svg viewBox="-18 -18 36 36" aria-hidden="true">
                        <BuildingArt city owner={0} />
                      </svg>
                      <strong>City</strong>
                      <span>2 points</span>
                    </div>
                  </div>
                </>
              )}
              {topic === 1 && (
                <>
                  <p>
                    Choose a bot, share a device, or play online. Each player
                    begins with no resource cards, chooses a starting
                    settlement, then places a road connected to it. The opening
                    pieces are taken from each player's available supply.
                  </p>
                  <p>
                    Gold pieces belong to Player 1. Blue pieces belong to Player
                    2 or the bot.
                  </p>
                </>
              )}
              {topic === 2 && (
                <>
                  <p>
                    Roll once at the start of your turn. Both players collect
                    from tiles matching the total: one card per adjacent
                    settlement, or two per city.
                  </p>
                  <div className="guide-illustrations">
                    {(["wood", "brick", "wheat", "ore", "sheep"] as const).map(
                      (resource) => (
                        <div key={resource}>
                          <svg viewBox="-20 -20 40 40" aria-hidden="true">
                            <TerrainArt resource={resource} />
                          </svg>
                          <span>{resource}</span>
                        </div>
                      ),
                    )}
                  </div>
                  <p>
                    On a 7, no tiles produce. Each player holding eight or more
                    cards discards half, rounded down. The player who rolled
                    moves the robber to another tile and steals one random card
                    from the opponent if they have a building beside that tile
                    and hold a card. The robber blocks production on its tile.
                  </p>
                </>
              )}
              {topic === 3 && (
                <>
                  <p>
                    Select a highlighted edge or corner, then choose a build.
                    Settlements need a connected road and no neighboring
                    settlement or city.
                  </p>
                  <div className="guide-costs">
                    <div>
                      <strong>Road</strong>
                      <span>1 wood + 1 brick</span>
                    </div>
                    <div>
                      <strong>Settlement</strong>
                      <span>1 wood + 1 brick + 1 wheat + 1 sheep</span>
                    </div>
                    <div>
                      <strong>City</strong>
                      <span>2 wheat + 3 ore</span>
                    </div>
                  </div>
                  <p>Upgrade one of your own settlements to build a city.</p>
                  <p>
                    The longest continuous road of at least five segments earns
                    two points. The holder keeps the award on a tie. An
                    opponent's settlement or city interrupts the road. Each
                    player can build up to 15 roads.
                  </p>
                </>
              )}
              {topic === 4 && (
                <>
                  <p>
                    Trade four matching cards for one different resource at the
                    bank. When a trade is available, choose the resource you
                    want to receive.
                  </p>
                  <p>
                    Offer one card for one different card to the other player or
                    bot. The recipient can accept or decline.
                  </p>
                  <p>
                    You can discard a card during your build phase. A roll of 7
                    requires players with eight or more cards to discard half.
                  </p>
                </>
              )}
              {topic === 5 && (
                <>
                  <p>
                    After rolling, trade as often as you can. Placing a road,
                    settlement, or city ends your turn automatically. You may
                    also end a turn without building.
                  </p>
                  <p>
                    Each turn lasts up to two minutes. When the timer reaches
                    zero, play passes automatically. Your game is saved on this
                    device.
                  </p>
                </>
              )}
              {topic === 6 && (
                <div className="forge-faq">
                  <details>
                    <summary>Why did a roll give me no resources?</summary>
                    <p>
                      Only matching tiles next to your settlements or cities
                      produce, and the robber blocks its tile. A roll of 7
                      produces no resources.
                    </p>
                  </details>
                  <details>
                    <summary>Why can’t I place a settlement?</summary>
                    <p>
                      Your starting settlement is placed during setup. Later
                      settlements need a connected road and resources. All
                      settlements must occupy an empty corner with no adjacent
                      settlement or city.
                    </p>
                  </details>
                  <details>
                    <summary>Can I play with a friend online?</summary>
                    <p>
                      Play against a bot, share a device, or choose online 1 vs.
                      1 to find another player. Online play requires a
                      configured game server.
                    </p>
                  </details>
                  <details>
                    <summary>Are there ports or development cards?</summary>
                    <p>
                      Not in this Forge variant. Victory points come from
                      settlements, cities and the longest road.
                    </p>
                  </details>
                </div>
              )}
            </div>
          </div>
          <div className="forge-guide-actions">
            <button
              className="button ghost"
              type="button"
              disabled={topic === 0}
              onClick={() => setTopic((value) => value - 1)}
            >
              Previous
            </button>
            <button
              className="button primary"
              type="button"
              onClick={() =>
                topic === topics.length - 1
                  ? setOpen(false)
                  : setTopic((value) => value + 1)
              }
            >
              {topic === topics.length - 1 ? "Back to game" : "Next"}
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
