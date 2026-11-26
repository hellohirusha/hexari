import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ForgeGameMenu from "../src/forge/ForgeGameMenu";

describe("game options dialog", () => {
  it("offers labelled, illustrated game controls", () => {
    const html = renderToStaticMarkup(
      <ForgeGameMenu
        finished={false}
        onClose={() => {}}
        onNewGame={() => {}}
        onPause={() => {}}
        onLeave={() => {}}
      />,
    );
    expect(html).toContain('aria-labelledby="forge-game-dialog-title"');
    for (const label of ["New game", "Pause game", "Leave game"]) {
      expect(html).toContain(`aria-label="${label}"`);
      expect(html).toContain(`title="${label}"`);
    }
    expect(html.match(/<svg /g)).toHaveLength(3);
    expect(html).toContain('aria-label="Close"');
  });
  it("disables pausing after a finished game", () => {
    const html = renderToStaticMarkup(
      <ForgeGameMenu
        finished
        onClose={() => {}}
        onNewGame={() => {}}
        onPause={() => {}}
        onLeave={() => {}}
      />,
    );
    expect(html).toMatch(/<button[^>]*aria-label="Pause game"[^>]*disabled/);
  });
});
