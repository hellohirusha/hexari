import { describe, expect, it, vi } from "vitest";
import { watchOutsideBuildPopover } from "../src/forge/outsideBuildPopover";

describe("build menu outside clicks", () => {
  it("keeps the menu open for clicks within it", () => {
    const documentTarget = new EventTarget();
    const dismiss = vi.fn();
    const stop = watchOutsideBuildPopover(
      documentTarget,
      { contains: () => true },
      { contains: () => true },
      dismiss,
    );
    documentTarget.dispatchEvent(new Event("click"));
    expect(dismiss).not.toHaveBeenCalled();
    stop();
  });

  it("dismisses a board click and prevents selecting a new board location", () => {
    const documentTarget = new EventTarget();
    const dismiss = vi.fn();
    const stop = watchOutsideBuildPopover(
      documentTarget,
      { contains: () => false },
      { contains: () => true },
      dismiss,
    );
    const click = new Event("click", { bubbles: true });
    const stopPropagation = vi.spyOn(click, "stopPropagation");
    documentTarget.dispatchEvent(click);
    expect(dismiss).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    stop();
  });

  it("dismisses without blocking other controls and removes its listener", () => {
    const documentTarget = new EventTarget();
    const dismiss = vi.fn();
    const stop = watchOutsideBuildPopover(
      documentTarget,
      { contains: () => false },
      { contains: () => false },
      dismiss,
    );
    const click = new Event("click", { bubbles: true });
    const stopPropagation = vi.spyOn(click, "stopPropagation");
    documentTarget.dispatchEvent(click);
    expect(dismiss).toHaveBeenCalledOnce();
    expect(stopPropagation).not.toHaveBeenCalled();
    stop();
    documentTarget.dispatchEvent(new Event("click"));
    expect(dismiss).toHaveBeenCalledOnce();
  });
});
