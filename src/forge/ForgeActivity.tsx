import { useRef, useState, type FormEvent } from "react";
import ForgeMessageDialog from "./ForgeMessageDialog";
import { deliverChat } from "./chatSend";

export type ChatMessage = {
  id?: string;
  player: string;
  text: string;
  flagged?: boolean;
};
export function onlineChatPlayerName(
  senderSeat: number,
  viewerSeat: number,
  names?: readonly [string, string],
) {
  return senderSeat === viewerSeat
    ? "You"
    : (names?.[senderSeat] ?? `Player ${senderSeat + 1}`);
}
export default function ForgeActivity({
  activity,
  chat,
  setChat,
  bot,
  player,
  onMessage,
  showChat = false,
  onSendChat,
  onReportChat,
  chatConnected = true,
  setup = false,
}: {
  activity: string[];
  chat: ChatMessage[];
  setChat: (chat: ChatMessage[]) => void;
  bot: boolean;
  player: number;
  onMessage: () => void;
  showChat?: boolean;
  onSendChat?: (text: string) => Promise<boolean>;
  onReportChat?: (id: string) => void;
  chatConnected?: boolean;
  setup?: boolean;
}) {
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const editVersion = useRef(0);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const flaggedCount = chat.filter((entry) => entry.flagged).length;
  async function send(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !chatConnected || sendingRef.current) return;
    const submittedVersion = editVersion.current;
    if (onSendChat) {
      sendingRef.current = true;
      setSending(true);
      setSendError("");
      const delivered = await deliverChat(onSendChat, trimmed);
      sendingRef.current = false;
      setSending(false);
      if (!delivered) {
        setSendError("Message not sent. Try again.");
        return;
      }
    } else
      setChat(
        [
          ...chat,
          { player: bot ? "Player 1" : `Player ${player}`, text: trimmed },
        ].slice(-100),
      );
    if (editVersion.current === submittedVersion) setText("");
    setSendError("");
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
            <p>
              {setup
                ? "Choose a starting settlement."
                : "Tap the dice to begin."}
            </p>
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
        <section
          className="forge-side-card forge-chat-card"
          data-open={chatOpen}
        >
          <button
            type="button"
            className="forge-side-heading forge-chat-toggle"
            aria-expanded={chatOpen}
            aria-controls="forge-chat-body"
            onClick={() => setChatOpen((open) => !open)}
          >
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
          </button>
          {chatOpen && (
            <div className="forge-chat-body" id="forge-chat-body">
              <div className="forge-chat-notice">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="m13 2-7 11h5l-1 9 8-12h-5l1-8Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Be respectful. Report abuse.</span>
              </div>
              <div className="forge-chat-review-bar">
                <span>{onSendChat ? "Online chat" : "Local chat"}</span>
                <button
                  type="button"
                  aria-pressed={reviewOnly}
                  onClick={() => setReviewOnly(!reviewOnly)}
                >
                  {reviewOnly ? "Show all" : "Review"}{" "}
                  <span>{flaggedCount}</span>
                </button>
              </div>
              <div className="forge-feed forge-chat-feed" aria-live="polite">
                {chat.length && (!reviewOnly || flaggedCount) ? (
                  <ol>
                    {chat.map(
                      (entry, i) =>
                        (!reviewOnly || entry.flagged) && (
                          <li
                            key={entry.id ?? i}
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
                                aria-label={`${entry.flagged ? "Reported" : "Report"} message ${i + 1} from ${entry.player}`}
                                title={
                                  entry.flagged ? "Reported" : "Report message"
                                }
                                aria-pressed={!!entry.flagged}
                                disabled={
                                  !!onReportChat &&
                                  (entry.flagged || !entry.id || !chatConnected)
                                }
                                onClick={() => {
                                  if (onReportChat && entry.id)
                                    onReportChat(entry.id);
                                  else
                                    setChat(
                                      chat.map((item, index) =>
                                        index === i
                                          ? { ...item, flagged: !item.flagged }
                                          : item,
                                      ),
                                    );
                                }}
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
                              {reviewOnly && !onSendChat && (
                                <button
                                  type="button"
                                  className="forge-chat-remove"
                                  aria-label={`Remove message ${i + 1} from ${entry.player}`}
                                  title="Remove message"
                                  onClick={() =>
                                    setChat(
                                      chat.filter((_, index) => index !== i),
                                    )
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
                  <p>
                    {reviewOnly ? "No flagged messages." : "No messages yet."}
                  </p>
                )}
              </div>
              {sendError && (
                <p className="forge-chat-error" role="alert">
                  {sendError}
                </p>
              )}
              <form className="forge-chat-form" onSubmit={send}>
                <label className="forge-chat-input">
                  <span className="sr-only">Message</span>
                  <input
                    value={text}
                    maxLength={240}
                    disabled={!chatConnected}
                    onChange={(e) => {
                      editVersion.current++;
                      setText(e.target.value);
                      setSendError("");
                    }}
                    placeholder="Send a message"
                  />
                </label>
                <button
                  type="submit"
                  className="chat-send"
                  disabled={!text.trim() || !chatConnected || sending}
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
            </div>
          )}
        </section>
      )}
    </section>
  );
}
