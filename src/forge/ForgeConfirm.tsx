import { useEffect, useRef } from "react";

export default function ForgeConfirm({
  changingOpponent,
  onConfirm,
  onCancel,
}: {
  changingOpponent: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="forge-confirm"
      aria-labelledby="forge-confirm-title"
      aria-describedby="forge-confirm-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="forge-confirm-title">
        {changingOpponent ? "Change opponent?" : "Start a new game?"}
      </h2>
      <p id="forge-confirm-description">
        {changingOpponent
          ? "Changing opponents starts a new game and replaces your saved game."
          : "Your saved game will be replaced."}
      </p>
      <div className="forge-confirm-actions">
        <button
          type="button"
          className="button ghost"
          onClick={onCancel}
          autoFocus
        >
          Cancel
        </button>
        <button type="button" className="button primary" onClick={onConfirm}>
          Start new game
        </button>
      </div>
    </dialog>
  );
}
