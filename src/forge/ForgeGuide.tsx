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
                    Choose a bot, share a device, or play online. Each player
                    chooses a highlighted corner for a free first settlement.
                    Settlements must be separated by at least one edge. Each
                    player begins with one of each resource.
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
                    On a 7, each player receives one of their least-held
                    resources, if their hand has room. Ties use an alternating
                    resource order. There is no robber.
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
                      produce. A 7 grants a least-held resource instead. A full
                      hand cannot receive more cards.
                    </p>
                  </details>
                  <details>
                    <summary>Why can’t I place a settlement?</summary>
                    <p>
                      Your first settlement is free. Later settlements need a
                      connected road and resources. All settlements must occupy
                      an empty corner with no adjacent settlement or city.
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
