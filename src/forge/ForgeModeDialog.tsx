import { useEffect, useRef } from "react";

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
        {hasSavedGame ? (
          <button type="button" className="button primary" onClick={onResume}>
            Resume game
          </button>
        ) : (
          <>
            <button
              type="button"
              className="button primary"
              onClick={() => onChoose("bot")}
            >
              Play with bot
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => onChoose("hotseat")}
            >
              Local 1 vs. 1
            </button>
          </>
        )}
        <button
          type="button"
          className="button ghost"
          onClick={() => onChoose("online")}
        >
          Online 1 vs. 1
        </button>
      </div>
    </dialog>
  );
}
