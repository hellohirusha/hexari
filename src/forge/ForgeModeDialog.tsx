import { useEffect, useRef, useState } from "react";
import "./ForgeModeDialog.css";

function ModeIcon({
  mode,
}: {
  mode: "resume" | "new" | "bot" | "hotseat" | "online";
}) {
  return (
    <svg
      className="forge-mode-choice-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {mode === "resume" && (
        <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />
      )}
      {mode === "new" && (
        <>
          <path d="M3 5v5h5M4 10a8 8 0 1 1 2 7" />
          <path d="M12 8v5l3 2" />
        </>
      )}
      {mode === "bot" && (
        <>
          <rect x="4" y="7" width="16" height="12" rx="3" />
          <path d="M12 7V4m-2 0h4M8 12h.01M16 12h.01M9 16h6M2 11v4m20-4v4" />
        </>
      )}
      {mode === "hotseat" && (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19v-1a5.5 5.5 0 0 1 11 0v1H3.5ZM16 5.4a3 3 0 0 1 0 5.7m.2 2.5a4.5 4.5 0 0 1 4.3 4.5v.9h-3" />
        </>
      )}
      {mode === "online" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </>
      )}
    </svg>
  );
}

export default function ForgeModeDialog({
  hasSavedGame,
  onResume,
  onChoose,
  onClose,
}: {
  hasSavedGame: boolean;
  onResume: () => void;
  onChoose: (mode: "bot" | "hotseat" | "online") => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [choosingNew, setChoosingNew] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="forge-confirm forge-mode-dialog"
      aria-labelledby="forge-mode-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="forge-mode-dialog-heading">
        <h2 id="forge-mode-title">Choose a game</h2>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="forge-welcome-actions">
        {hasSavedGame && !choosingNew ? (
          <>
            <button
              type="button"
              className="button primary forge-mode-choice"
              onClick={onResume}
            >
              <ModeIcon mode="resume" />
              <span className="forge-mode-choice-label">Resume game</span>
            </button>
            <button
              type="button"
              className="button ghost forge-mode-choice"
              onClick={() => setChoosingNew(true)}
            >
              <ModeIcon mode="new" />
              <span className="forge-mode-choice-label">Start new game</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="button primary forge-mode-choice"
              onClick={() => onChoose("bot")}
            >
              <ModeIcon mode="bot" />
              <span className="forge-mode-choice-label">Play with bot</span>
            </button>
            <button
              type="button"
              className="button ghost forge-mode-choice"
              onClick={() => onChoose("hotseat")}
            >
              <ModeIcon mode="hotseat" />
              <span className="forge-mode-choice-label">Local 1 vs. 1</span>
            </button>
          </>
        )}
        <button
          type="button"
          className="button ghost forge-mode-choice"
          onClick={() => onChoose("online")}
        >
          <ModeIcon mode="online" />
          <span className="forge-mode-choice-label">Online 1 vs. 1</span>
        </button>
      </div>
    </dialog>
  );
}
