import { afterEach, expect, it, vi } from "vitest";
import { watchFocusLoss } from "../src/forge/focusPause";

afterEach(() => vi.unstubAllGlobals());

it("pauses on window blur and on hiding the page, but not on returning", () => {
  const fakeWindow = new EventTarget();
  const fakeDocument = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("document", fakeDocument);
  const pause = vi.fn();
  const stop = watchFocusLoss(pause);
  fakeWindow.dispatchEvent(new Event("blur"));
  fakeDocument.hidden = true;
  fakeDocument.dispatchEvent(new Event("visibilitychange"));
  fakeDocument.hidden = false;
  fakeDocument.dispatchEvent(new Event("visibilitychange"));
  expect(pause).toHaveBeenCalledTimes(2);
  stop();
  fakeWindow.dispatchEvent(new Event("blur"));
  expect(pause).toHaveBeenCalledTimes(2);
});
