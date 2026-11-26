import type { ReactNode } from "react";
import "./ForgeDialogActions.css";

type ActionIcon = "resume" | "pause" | "leave" | "replay" | "board" | "home";

const icons: Record<ActionIcon, ReactNode> = {
  resume: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
  pause: <path d="M8 5v14M16 5v14" />,
  leave: (
    <>
      <path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" />
    </>
  ),
  replay: (
    <>
      <path d="M3 5v5h5M4 10a8 8 0 1 1 2 7" />
      <path d="M12 8v5l3 2" />
    </>
  ),
  board: (
    <>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-7 9 7M5 10v10h14V10M9 20v-6h6v6" />
    </>
  ),
};

export default function ForgeDialogAction({
  label,
  icon,
  primary = false,
  autoFocus = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: ActionIcon;
  primary?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="forge-dialog-action-tile">
      <button
        type="button"
        className={`button ${primary ? "primary" : "ghost"} forge-dialog-icon-button`}
        aria-label={label}
        title={label}
        autoFocus={autoFocus}
        disabled={disabled}
        onClick={onClick}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {icons[icon]}
        </svg>
      </button>
    </div>
  );
}
