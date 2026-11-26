import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const harness = vi.hoisted(() => ({ page: "Audio" }));
vi.mock("react", async (load) => {
  const actual = await load<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) =>
      initial === "Settings"
        ? [harness.page, () => {}]
        : actual.useState(initial),
  };
});
import ForgeSettings from "../src/forge/ForgeSettings";

const noop = () => {};
function renderSettings(
  sound: boolean,
  shortcuts: boolean,
  timerRunning = true,
) {
  return renderToStaticMarkup(
    <ForgeSettings
      sound={sound}
      onSound={noop}
      volume={0.5}
      onVolume={noop}
      fontSize={103}
      onFontSize={noop}
      shortcuts={shortcuts}
      onShortcuts={noop}
      onClose={noop}
      timerRunning={timerRunning}
    />,
  );
}

describe("Forge settings accessibility", () => {
  it("omits the running timer notice when the timer has stopped", () => {
    harness.page = "Account";
    expect(renderSettings(false, false, false)).not.toContain(
      "The turn timer continues while settings are open.",
    );
    expect(renderSettings(false, false, true)).toContain(
      "The turn timer continues while settings are open.",
    );
  });
  it.each([true, false])("labels the sound toggle when sound is %s", (on) => {
    harness.page = "Audio";
    const html = renderSettings(on, false);
    expect(html).toMatch(
      new RegExp(`aria-label="Sound"[^>]*aria-pressed="${on}"`),
    );
  });
  it.each([true, false])(
    "labels the keyboard shortcuts toggle when shortcuts are %s",
    (on) => {
      harness.page = "Controls";
      const html = renderSettings(false, on);
      expect(html).toMatch(
        new RegExp(`aria-label="Keyboard shortcuts"[^>]*aria-pressed="${on}"`),
      );
    },
  );
});
