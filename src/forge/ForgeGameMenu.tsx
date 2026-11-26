import { useEffect, useRef } from "react";
import ForgeDialogAction from "./ForgeDialogAction";
import "./ForgeGameMenu.css";

export default function ForgeGameMenu({
  finished,
  onClose,
  onNewGame,
  onPause,
  onLeave,
}: {
  finished: boolean;
  onClose: () => void;
  onNewGame: () => void;
  onPause: () => void;
  onLeave: () => void;
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
      id="forge-game-menu"
      className="forge-confirm forge-game-dialog"
      aria-labelledby="forge-game-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="forge-game-dialog-heading">
        <h2 id="forge-game-dialog-title">Game options</h2>
        <button
          type="button"
          aria-label="Close"
          title="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="forge-game-dialog-actions">
        <ForgeDialogAction
          label="New game"
          icon="replay"
          primary
          onClick={onNewGame}
        />
        <ForgeDialogAction
          label="Pause game"
          icon="pause"
          disabled={finished}
          onClick={onPause}
        />
        <ForgeDialogAction label="Leave game" icon="leave" onClick={onLeave} />
      </div>
    </dialog>
  );
}
