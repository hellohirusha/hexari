import { useEffect, useState } from "react";

type Theme = "dark" | "light";
export function initialTheme(
  storageKey = "hexari-theme",
  defaultTheme?: Theme,
): Theme {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    /* use the system preference */
  }
  if (defaultTheme) return defaultTheme;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}
export default function ThemeToggle({
  storageKey = "hexari-theme",
  defaultTheme,
}: { storageKey?: string; defaultTheme?: Theme } = {}) {
  const [theme, setTheme] = useState<Theme>(() =>
    initialTheme(storageKey, defaultTheme),
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      /* preference remains active for this visit */
    }
  }, [theme, storageKey]);
  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={
        theme === "dark" ? "Switch to light mode" : "Switch to night mode"
      }
      title={theme === "dark" ? "Switch to light mode" : "Switch to night mode"}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "light" ? (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20.2 15.1A8.4 8.4 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="4"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
