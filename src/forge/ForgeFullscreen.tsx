import { useEffect, useState } from "react";

/** Keep the control in sync with browser and keyboard fullscreen changes. */
export default function ForgeFullscreen() {
  const [active, setActive] = useState(
    () =>
      typeof document !== "undefined" && Boolean(document.fullscreenElement),
  );
  const supported =
    typeof document !== "undefined" &&
    typeof document.documentElement.requestFullscreen === "function" &&
    typeof document.exitFullscreen === "function";

  useEffect(() => {
    const update = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const label = active ? "Exit full screen" : "Enter full screen";
  return (
    <button
      type="button"
      className="button ghost forge-fullscreen-toggle"
      aria-label={label}
      aria-pressed={active}
      title={supported ? label : "Full screen is not supported in this browser"}
      disabled={!supported}
      onClick={() => {
        const change = document.fullscreenElement
          ? document.exitFullscreen()
          : document.documentElement.requestFullscreen();
        void change.catch(() => {});
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        {active ? (
          <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />
        ) : (
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        )}
      </svg>
    </button>
  );
}
