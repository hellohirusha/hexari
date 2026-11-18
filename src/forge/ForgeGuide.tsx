import { useState } from "react";
import { BuildingArt, TerrainArt } from "../shared/TerrainArt";

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
        <div id="forge-guide-content" className="panel forge-guide-panel">
          <div className="forge-guide-header">
            <div>
              <span className="section-kicker">THE FORGE FIELD GUIDE</span>
              <h2>Learn the game</h2>
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
                    Choose a bot or share one device with a friend. Each player
                    starts with one settlement on the fixed board and one of
                    each resource.
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
                  <p>A 7 produces nothing in Forge. There is no robber.</p>
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
                    <div>
                      <strong>Farm</strong>
                      <span>1 wood + 1 brick + 1 wheat</span>
                    </div>
                    <div>
                      <strong>Market</strong>
                      <span>2 wood + 1 brick + 1 sheep</span>
                    </div>
                  </div>
                  <p>Upgrade one of your own settlements to build a city.</p>
                  <p>
                    Add one improvement to a settlement or city. A farm requires
                    adjacent wheat and adds one wheat on matching rolls. A
                    market improves bank trades to 3:1.
                  </p>
                </>
              )}
              {topic === 4 && (
                <>
                  <p>
                    Trade four matching cards for one different resource at the
                    bank, or three if you have a market. When a trade is
                    available, choose the resource you want to receive.
                  </p>
                  <p>
                    Offer one card for one different card to the other player or
                    bot. The recipient can accept or decline.
                  </p>
                  <p>
                    Your hand holds at most seven cards. Excess production is
                    lost. During your build phase, you can discard a card to
                    make room.
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
                      produce. A 7 produces nothing, and a full hand cannot
                      receive more cards.
                    </p>
                  </details>
                  <details>
                    <summary>Why can’t I place a settlement?</summary>
                    <p>
                      It must connect to your road, occupy an empty corner, and
                      have no settlement or city on an adjacent corner. You also
                      need the resources.
                    </p>
                  </details>
                  <details>
                    <summary>Can I play with a friend online?</summary>
                    <p>
                      Forge currently supports a local bot or two people sharing
                      one device. Online multiplayer is not available yet.
                    </p>
                  </details>
                  <details>
                    <summary>
                      Are there ports, development cards, or longest-road
                      points?
                    </summary>
                    <p>
                      Not in this Forge variant. Victory points come from
                      settlements and cities.
                    </p>
                  </details>
                </div>
              )}
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
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
