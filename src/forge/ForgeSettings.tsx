import { useEffect, useRef, useState } from "react";
import ThemeToggle from "../shared/ThemeToggle";

type Page = "Settings" | "Audio" | "Text size" | "Controls" | "Game info";
export default function ForgeSettings({
  sound,
  onSound,
  volume,
  onVolume,
  fontSize,
  onFontSize,
  shortcuts,
  onShortcuts,
  onClose,
}: {
  sound: boolean;
  onSound: () => void;
  volume: number;
  onVolume: (value: number) => void;
  fontSize: number;
  onFontSize: (value: number) => void;
  shortcuts: boolean;
  onShortcuts: (enabled: boolean) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState<Page>("Settings");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="forge-confirm forge-settings"
      aria-labelledby="forge-settings-title"
      onCancel={(event) => {
        event.preventDefault();
        if (page === "Settings") onClose();
        else setPage("Settings");
      }}
    >
      <div className="forge-settings-heading">
        {page !== "Settings" && (
          <button
            type="button"
            aria-label="Back to settings"
            onClick={() => setPage("Settings")}
          >
            ‹
          </button>
        )}
        <h2 id="forge-settings-title">{page}</h2>
        <button type="button" aria-label="Close settings" onClick={onClose}>
          ×
        </button>
      </div>
      {page === "Settings" && (
        <>
          <div className="forge-settings-pages">
            <button type="button" onClick={() => setPage("Audio")}>
              <span aria-hidden="true">♫</span> Audio{" "}
              <span aria-hidden="true">›</span>
            </button>
            <button type="button" onClick={() => setPage("Text size")}>
              <span aria-hidden="true">Aa</span> Text size{" "}
              <span aria-hidden="true">›</span>
            </button>
            <button type="button" onClick={() => setPage("Controls")}>
              <span aria-hidden="true">⌨</span> Controls{" "}
              <span aria-hidden="true">›</span>
            </button>
            <button type="button" onClick={() => setPage("Game info")}>
              <span aria-hidden="true">ⓘ</span> Game info{" "}
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <div className="forge-settings-row">
            <strong>Theme</strong>
            <ThemeToggle storageKey="forge-theme" defaultTheme="dark" />
          </div>
        </>
      )}
      {page === "Audio" && (
        <>
          <div className="forge-settings-row">
            <div>
              <strong>Sound</strong>
              <p>Music and game effects</p>
            </div>
            <button
              className="button ghost"
              type="button"
              aria-pressed={sound}
              onClick={onSound}
            >
              {sound ? "On" : "Off"}
            </button>
          </div>
          <label className="forge-settings-volume">
            <span>
              Volume <strong>{Math.round(volume * 100)}%</strong>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(volume * 100)}
              onChange={(event) => onVolume(Number(event.target.value) / 100)}
            />
          </label>
        </>
      )}
      {page === "Text size" && (
        <label className="forge-settings-volume">
          <span>
            Text size <strong>{fontSize}%</strong>
          </span>
          <input
            type="range"
            min="100"
            max="140"
            step="1"
            value={fontSize}
            onChange={(event) => onFontSize(Number(event.target.value))}
          />
        </label>
      )}
      {page === "Controls" && (
        <>
          <div className="forge-settings-row">
            <strong>Keyboard shortcuts</strong>
            <button
              type="button"
              className="button ghost"
              aria-pressed={shortcuts}
              onClick={() => onShortcuts(!shortcuts)}
            >
              {shortcuts ? "On" : "Off"}
            </button>
          </div>
          <dl className="forge-shortcuts">
            {[
              ["Roll dice / end turn", "Space"],
              ["Pause / resume", "P"],
              ["Full screen", "F"],
              ["Mute / unmute", "M"],
              ["Volume", "↑ / ↓"],
            ].map(([name, key]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>
                  <kbd>{key}</kbd>
                </dd>
              </div>
            ))}
          </dl>
          <p className="forge-settings-note">
            Shortcuts do not run while typing. Space keeps its normal behavior
            on controls.
          </p>
        </>
      )}
      {page === "Game info" && (
        <div className="forge-game-info">
          <p>
            Forge is a two-player speed game. Reach 5 victory points to win.
          </p>
          <p>
            Roll for resources, trade, and select the board to build. A
            successful build ends your turn.
          </p>
          <p>
            Build a farm beside wheat for an extra wheat on matching rolls, or a
            market for 3:1 bank trades. Each building can have one improvement.
          </p>
          <p>
            Play against the bot or share this device with another player. Games
            are saved locally.
          </p>
        </div>
      )}
      <p className="forge-settings-note">
        The turn timer continues while settings are open.
      </p>
    </dialog>
  );
}
