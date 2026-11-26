import { useEffect, useRef, useState } from "react";
import BrandMark from "../shared/BrandMark";
import { forgeHref } from "../shared/navigation";
import { returningToAnalyzer } from "./forgeInvitationNavigation";

export default function ForgeInvitation() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [returning] = useState(() =>
    returningToAnalyzer(window.location.href, document.referrer),
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (["tools", "forge"].includes(url.searchParams.get("from") ?? "")) {
      url.searchParams.delete("from");
      window.history.replaceState(window.history.state, "", url);
    }
    if (returning) return;
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, [returning]);

  if (returning) return null;

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
          href={forgeHref()}
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
