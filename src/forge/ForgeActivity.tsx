import { useState, type FormEvent } from "react";
import ForgeMessageDialog from "./ForgeMessageDialog";

export type ChatMessage = { player: string; text: string; flagged?: boolean };
export default function ForgeActivity({
  activity,
  chat,
  setChat,
  bot,
  player,
  onMessage,
  showChat = false,
}: {
  activity: string[];
  chat: ChatMessage[];
  setChat: (chat: ChatMessage[]) => void;
  bot: boolean;
  player: number;
  onMessage: () => void;
  showChat?: boolean;
}) {
  const [text, setText] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const flaggedCount = chat.filter((entry) => entry.flagged).length;
  function send(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setChat(
      [
        ...chat,
        { player: bot ? "Player 1" : `Player ${player}`, text: trimmed },
      ].slice(-100),
    );
    setText("");
    onMessage();
  }
  return (
    <section
      className="panel forge-activity"
      aria-label="Game activity and chat"
    >
      <section
        className="forge-side-card forge-activity-card"
        aria-labelledby="forge-activity-heading"
      >
        <div className="forge-activity-heading">
          <h3 id="forge-activity-heading" className="forge-side-heading">
            Activity <span>{activity.length || ""}</span>
          </h3>
          {activity.length > 2 && (
            <button
              type="button"
              className="forge-activity-more"
              onClick={() => setShowActivity(true)}
            >
              View all
            </button>
          )}
        </div>
        <div className="forge-feed" aria-live="polite">
          {activity.length ? (
            <ol>
              {activity
                .slice(-2)
                .reverse()
                .map((entry, i) => (
                  <li key={i}>{entry}</li>
                ))}
            </ol>
          ) : (
            <p>Tap the dice to begin.</p>
          )}
        </div>
      </section>
      {showActivity && (
        <ForgeMessageDialog
          title="Activity"
          onClose={() => setShowActivity(false)}
        >
          <ol className="forge-activity-history">
            {[...activity].reverse().map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ol>
        </ForgeMessageDialog>
      )}
      {showChat && (
        <details className="forge-side-card forge-chat-card" open>
          <summary className="forge-side-heading">
            <span className="forge-chat-title">
              Table chat <span>{chat.length || ""}</span>
            </span>
            <svg
              className="forge-chat-chevron"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m6 9 6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>
          <div className="forge-chat-notice">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m13 2-7 11h5l-1 9 8-12h-5l1-8Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              Be respectful. Messages can be flagged for review on this device.
            </span>
          </div>
          <div className="forge-chat-review-bar">
            <span>Local chat</span>
            <button
              type="button"
              aria-pressed={reviewOnly}
              onClick={() => setReviewOnly(!reviewOnly)}
            >
              {reviewOnly ? "Show all" : "Review"} <span>{flaggedCount}</span>
            </button>
          </div>
          <div className="forge-feed forge-chat-feed" aria-live="polite">
            {chat.length && (!reviewOnly || flaggedCount) ? (
              <ol>
                {chat.map(
                  (entry, i) =>
                    (!reviewOnly || entry.flagged) && (
                      <li
                        key={i}
                        className={
                          entry.flagged ? "forge-chat-flagged" : undefined
                        }
                      >
                        <div className="forge-chat-message">
                          <strong>{entry.player}</strong>
                          <span>{entry.text}</span>
                        </div>
                        <div className="forge-chat-actions">
                          <button
                            type="button"
                            aria-label={`${entry.flagged ? "Remove flag from" : "Flag for review"} message ${i + 1} from ${entry.player}`}
                            title={
                              entry.flagged ? "Remove flag" : "Flag for review"
                            }
                            aria-pressed={!!entry.flagged}
                            onClick={() =>
                              setChat(
                                chat.map((item, index) =>
                                  index === i
                                    ? { ...item, flagged: !item.flagged }
                                    : item,
                                ),
                              )
                            }
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M5 21V4m0 1h11l-2 4 2 4H5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          {reviewOnly && (
                            <button
                              type="button"
                              className="forge-chat-remove"
                              aria-label={`Remove message ${i + 1} from ${entry.player}`}
                              title="Remove message"
                              onClick={() =>
                                setChat(chat.filter((_, index) => index !== i))
                              }
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </li>
                    ),
                )}
              </ol>
            ) : (
              <p>{reviewOnly ? "No flagged messages." : "No messages yet."}</p>
            )}
          </div>
          <form className="forge-chat-form" onSubmit={send}>
            <label className="forge-chat-input">
              <span className="sr-only">Message</span>
              <input
                value={text}
                maxLength={240}
                onChange={(e) => setText(e.target.value)}
                placeholder="Send a message"
              />
            </label>
            <button
              type="submit"
              className="chat-send"
              disabled={!text.trim()}
              aria-label="Send message"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M21 3 3 10.5l7 2.5 2.5 7L21 3ZM10 13l5-5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
