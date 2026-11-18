import { useEffect, useRef, type ReactNode } from "react";

export default function ForgeMessageDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
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
      className="forge-confirm forge-message-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2>{title}</h2>
      <div className="forge-message-dialog-content">{children}</div>
      <div className="forge-confirm-actions">
        <button
          type="button"
          className="button primary"
          onClick={onClose}
          autoFocus
        >
          Close
        </button>
      </div>
    </dialog>
  );
}
