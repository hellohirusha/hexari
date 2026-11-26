import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newGame } from "../src/forge/engine";
import { useOpeningPlacements } from "../src/forge/useOpeningPlacements";

type Effect = { deps: readonly unknown[]; cleanup?: () => void };
const harness = vi.hoisted(() => ({
  state: null as unknown,
  deps: undefined as readonly unknown[] | undefined,
  effect: undefined as Effect | undefined,
  pending: undefined as (() => void) | undefined,
  sound: vi.fn(),
}));

vi.mock("react", async (load) => {
  const actual = await load<typeof import("react")>();
  return {
    ...actual,
    useState: () => [
      harness.state,
      (next: unknown) => {
        harness.state =
          typeof next === "function"
            ? (next as (previous: unknown) => unknown)(harness.state)
            : next;
      },
    ],
    useCallback: (fn: unknown) => fn,
    useEffect: (
      effect: () => void | (() => void),
      deps: readonly unknown[],
    ) => {
      if (
        !harness.deps ||
        deps.some((item, index) => !Object.is(item, harness.deps?.[index]))
      ) {
        harness.pending = () => {
          harness.effect?.cleanup?.();
          const cleanup = effect();
          harness.effect = { deps, cleanup: cleanup || undefined };
          harness.deps = deps;
        };
      }
    },
  };
});
vi.mock("../src/forge/sound", () => ({ soundCue: harness.sound }));

function Render(started: boolean, ready: boolean, sound = true) {
  const opening = useOpeningPlacements(started, ready, sound);
  harness.pending?.();
  harness.pending = undefined;
  return opening;
}

beforeEach(() => {
  vi.useFakeTimers();
  harness.state = null;
  harness.deps = undefined;
  harness.effect = undefined;
  harness.pending = undefined;
  harness.sound.mockReset();
});
afterEach(() => {
  harness.effect?.cleanup?.();
  vi.useRealTimers();
});

describe("Forge opening placements", () => {
  it("waits for the board and starts the drop and sound together", () => {
    const initial = newGame(0);
    Render(false, false).beginOpening(initial);
    let view = Render(true, false);
    expect(view.opening?.phase).toBe("waiting");
    expect(view.opening?.keys).toEqual(
      new Set(["settlement:0:23", "settlement:1:38"]),
    );
    vi.advanceTimersByTime(500);
    Render(true, true);
    vi.advanceTimersByTime(699);
    expect(harness.sound).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    view = Render(true, true);
    expect(view.opening?.phase).toBe("landing");
    expect(harness.sound).toHaveBeenCalledExactlyOnceWith("settlement");
    vi.advanceTimersByTime(900);
    expect(Render(true, true).opening).toBeNull();
  });

  it("reveals the pieces if Pixi is unavailable and respects muted sound", () => {
    Render(false, false).beginOpening(newGame(0));
    Render(true, false, false);
    vi.advanceTimersByTime(3000);
    expect(Render(true, false, false).opening?.phase).toBe("landing");
    expect(harness.sound).not.toHaveBeenCalled();
  });

  it("cancels a pending opening when the player leaves", () => {
    Render(false, false).beginOpening(newGame(0));
    Render(true, true);
    Render(false, true);
    vi.advanceTimersByTime(3000);
    expect(harness.sound).not.toHaveBeenCalled();
  });
});
