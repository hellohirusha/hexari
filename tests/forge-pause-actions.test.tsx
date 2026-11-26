import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ForgePause from "../src/forge/ForgePause";

describe("Forge pause controls", () => {
  it("presents named icon controls and the remaining time", () => {
    const html = renderToStaticMarkup(
      <ForgePause remaining={100} onResume={() => {}} onLeave={() => {}} />,
    );
    expect(html).toContain("1:40");
    expect(html).toContain('aria-label="Resume game"');
    expect(html).toContain('aria-label="Leave game"');
    expect(html.match(/class="forge-dialog-action-tile"/g) ?? []).toHaveLength(
      2,
    );
    expect(html.match(/<svg/g) ?? []).toHaveLength(2);
  });
});
