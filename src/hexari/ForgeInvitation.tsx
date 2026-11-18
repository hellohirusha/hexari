import { useEffect, useRef } from "react";
import BrandMark from "../shared/BrandMark";

export default function ForgeInvitation() {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      className="forge-invitation"
      ref={dialog}
      aria-labelledby="forge-invitation-title"
    >
      <BrandMark variant="forge" />
      <h2 id="forge-invitation-title">Try Forge</h2>
      <p>Play a quick game against a bot or a friend.</p>
      <div className="forge-invitation-actions">
        <a
          className="button primary"
          href="/forge"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => dialog.current?.close()}
        >
          Try now
        </a>
        <button
          className="button ghost"
          type="button"
          onClick={() => dialog.current?.close()}
        >
          Later
        </button>
      </div>
    </dialog>
  );
}
