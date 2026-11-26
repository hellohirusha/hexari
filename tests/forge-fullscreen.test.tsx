import { afterEach, describe, expect, it, vi } from "vitest";
import ForgeFullscreen from "../src/forge/ForgeFullscreen";

vi.mock("react", async (load) => {
  const actual = await load<typeof import("react")>();
  return {
    ...actual,
    useEffect: () => {},
    useState: (initial: unknown) => [
      typeof initial === "function" ? initial() : initial,
      () => {},
    ],
  };
});

afterEach(() => vi.unstubAllGlobals());

describe("Forge fullscreen control", () => {
  it("enters fullscreen and changes to an exit control when active", () => {
    const request = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn().mockResolvedValue(undefined);
    const doc = {
      fullscreenElement: null as unknown,
      documentElement: { requestFullscreen: request },
      exitFullscreen: exit,
    };
    vi.stubGlobal("document", doc);
    const enterButton = ForgeFullscreen();
    expect(enterButton.props["aria-label"]).toBe("Enter full screen");
    enterButton.props.onClick();
    expect(request).toHaveBeenCalledOnce();
    doc.fullscreenElement = doc.documentElement;
    const exitButton = ForgeFullscreen();
    expect(exitButton.props["aria-label"]).toBe("Exit full screen");
    exitButton.props.onClick();
    expect(exit).toHaveBeenCalledOnce();
  });
});
