import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ForgeModeDialog from "../src/forge/ForgeModeDialog";

describe("Forge game selection", () => {
  it("shows all modes and marks online as unavailable", () => {
    const html = renderToStaticMarkup(
      <ForgeModeDialog
        hasSavedGame={false}
        onResume={() => {}}
        onChoose={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("Play with bot");
    expect(html).toContain("Local 1 vs. 1");
    expect(html).toContain("Online 1 vs. 1");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Resume game");
  });
  it("offers resume when a saved game exists", () => {
    const html = renderToStaticMarkup(
      <ForgeModeDialog
        hasSavedGame
        onResume={() => {}}
        onChoose={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("Resume game");
    expect(html).not.toContain("Play with bot");
    expect(html).not.toContain("Local 1 vs. 1");
    expect(html).not.toContain("Online 1 vs. 1");
  });
});
