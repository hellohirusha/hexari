import { useEffect, useRef } from "react";
import ForgeDialogAction from "./ForgeDialogAction";

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
        <ForgeDialogAction
          label="Resume game"
          icon="resume"
          primary
          onClick={onResume}
          autoFocus
        />
        <ForgeDialogAction label="Leave game" icon="leave" onClick={onLeave} />
      </div>
    </dialog>
  );
}
