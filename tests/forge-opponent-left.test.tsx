import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ForgeOpponentLeftNotice from "../src/forge/ForgeOpponentLeftNotice";
import { isOpponentDeparture } from "../src/forge/online/opponentDeparture";

describe("opponent left notice", () => {
  it("announces the departure and offers both next steps without a modal", () => {
    const html = renderToStaticMarkup(
      <ForgeOpponentLeftNotice onReturn={() => {}} onFindGame={() => {}} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Opponent left");
    expect(html).toContain("Return to menu");
    expect(html).toContain("Find new game");
    expect(html).not.toContain("<dialog");
  });
  it("distinguishes a permanent departure from a recoverable disconnect", () => {
    expect(isOpponentDeparture("opponent_left", false)).toBe(true);
    expect(isOpponentDeparture("opponent_timeout", false)).toBe(true);
    expect(isOpponentDeparture("opponent_timeout", true)).toBe(false);
    expect(isOpponentDeparture(undefined, true)).toBe(false);
    expect(isOpponentDeparture(undefined, false)).toBe(false);
  });
  it("explains a temporary disconnect and keeps both actions available", () => {
    const html = renderToStaticMarkup(
      <ForgeOpponentLeftNotice
        disconnected
        onReturn={() => {}}
        onFindGame={() => {}}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Opponent disconnected");
    expect(html).toContain("paused while they reconnect");
    expect(html).toContain("Return to menu");
    expect(html).toContain("Find new game");
  });
  it("explains that a timed-out saved game can be resumed", () => {
    const html = renderToStaticMarkup(
      <ForgeOpponentLeftNotice
        disconnected
        timedOut
        onReturn={() => {}}
        onFindGame={() => {}}
      />,
    );
    expect(html).toContain("resume this saved game");
  });
});
