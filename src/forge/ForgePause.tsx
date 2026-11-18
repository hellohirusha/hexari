import { useEffect, useRef } from "react";

export default function ForgePause({
  onResume,
  onLeave,
  remaining,
}: {
  onResume: () => void;
  onLeave: () => void;
  remaining: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="forge-confirm forge-pause"
      aria-labelledby="forge-pause-title"
      onCancel={(event) => {
        event.preventDefault();
        onResume();
      }}
    >
      <h2 id="forge-pause-title">Paused</h2>
      <p>Turn time remaining</p>
      <strong className="forge-pause-time">
        {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
      </strong>
      <div className="forge-confirm-actions">
        <button
          type="button"
          className="button primary"
          onClick={onResume}
          autoFocus
        >
          Resume game
        </button>
        <button type="button" className="button ghost" onClick={onLeave}>
          Leave game
        </button>
      </div>
    </dialog>
  );
}
