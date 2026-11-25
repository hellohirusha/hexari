import { beforeEach, describe, expect, it, vi } from "vitest";
import { useResultAudio } from "../src/forge/useResultAudio";

type Cleanup = (() => void) | void;
type EffectSlot = {
  dependencies?: readonly unknown[];
  cleanup?: Cleanup;
  effect?: () => Cleanup;
};

const harness = vi.hoisted(() => ({
  cursor: 0,
  refs: [] as Array<{ current: unknown } | undefined>,
  effects: [] as Array<EffectSlot | undefined>,
  pending: [] as Array<() => void>,
  resultPlayers: [] as Array<{ stop: ReturnType<typeof vi.fn> }>,
  musicPlayers: [] as Array<{ stop: ReturnType<typeof vi.fn> }>,
  startResultAudio: vi.fn(),
  startResultMusic: vi.fn(),
}));

vi.mock("react", async (load) => {
  const actual = await load<typeof import("react")>();
  return {
    ...actual,
    useRef: (initial: unknown) => {
      const index = harness.cursor++;
      return (harness.refs[index] ??= { current: initial });
    },
    useEffect: (effect: () => Cleanup, dependencies?: readonly unknown[]) => {
      const index = harness.cursor++;
      const previous = harness.effects[index];
      const changed =
        !previous ||
        !dependencies ||
        !previous.dependencies ||
        dependencies.length !== previous.dependencies.length ||
        dependencies.some(
          (dependency, i) => !Object.is(dependency, previous.dependencies![i]),
        );
      if (changed) {
        harness.pending.push(() => {
          previous?.cleanup?.();
          harness.effects[index] = { dependencies, effect, cleanup: effect() };
        });
      }
    },
  };
});

vi.mock("../src/forge/sound", () => ({
  resultSound: (winner: number, opponent: string, seat?: number) => {
    if (opponent === "hotseat") return "win";
    if (opponent === "online" && seat === undefined) return null;
    return winner === (opponent === "bot" ? 0 : seat) ? "win" : "lose";
  },
  startResultAudio: harness.startResultAudio,
  startResultMusic: harness.startResultMusic,
}));

type Options = Parameters<typeof useResultAudio>[0];
const result = (winner: number): Options => ({
  started: true,
  sound: true,
  phase: "end",
  winner,
  opponent: "bot",
  seat: undefined,
});

function Render(options: Options) {
  // The test harness intentionally resets its simulated hook cursor on each render.
  // eslint-disable-next-line react-hooks/immutability
  harness.cursor = 0;
  // eslint-disable-next-line react-hooks/immutability
  harness.pending = [];
  useResultAudio(options);
  harness.pending.forEach((run) => run());
}

beforeEach(() => {
  harness.cursor = 0;
  harness.refs = [];
  harness.effects = [];
  harness.pending = [];
  harness.resultPlayers = [];
  harness.musicPlayers = [];
  harness.startResultAudio.mockReset().mockImplementation(() => {
    const player = { stop: vi.fn() };
    harness.resultPlayers.push(player);
    return player;
  });
  harness.startResultMusic.mockReset().mockImplementation(() => {
    const player = { stop: vi.fn() };
    harness.musicPlayers.push(player);
    return player;
  });
});

describe("Forge result audio lifecycle", () => {
  it.each([
    { winner: 0, cue: "win" },
    { winner: 1, cue: "lose" },
  ])(
    "plays the $cue cue once while viewing the board and results",
    ({ winner, cue }) => {
      const options = result(winner);
      Render(options);
      expect(harness.startResultAudio).toHaveBeenCalledExactlyOnceWith(cue);

      // The parent re-renders when the result dialog closes and opens again.
      Render({ ...options });
      Render({ ...options });
      expect(harness.startResultAudio).toHaveBeenCalledTimes(1);
      expect(harness.resultPlayers[0].stop).not.toHaveBeenCalled();
      expect(harness.startResultMusic).not.toHaveBeenCalled();
    },
  );

  it("stops when muted and resumes only the background music when unmuted", () => {
    const options = result(0);
    Render(options);
    Render({ ...options, sound: false });
    expect(harness.resultPlayers[0].stop).toHaveBeenCalledOnce();
    Render(options);
    expect(harness.startResultAudio).toHaveBeenCalledOnce();
    expect(harness.startResultMusic).toHaveBeenCalledOnce();
  });

  it("stops after a game ends and plays a fresh cue for the next game", () => {
    const options = result(0);
    Render(options);
    Render({ ...options, phase: "setup", winner: null });
    expect(harness.resultPlayers[0].stop).toHaveBeenCalledOnce();
    Render(result(1));
    expect(harness.startResultAudio).toHaveBeenCalledTimes(2);
    expect(harness.startResultAudio).toHaveBeenLastCalledWith("lose");
  });

  it("waits until an online player's seat is known before choosing a cue", () => {
    const options = { ...result(1), opponent: "online" as const };
    Render(options);
    expect(harness.startResultAudio).not.toHaveBeenCalled();
    Render({ ...options, seat: 1 });
    expect(harness.startResultAudio).toHaveBeenCalledExactlyOnceWith("win");
  });

  it("stops the background music when leaving the game", () => {
    const options = result(0);
    Render(options);
    Render({ ...options, sound: false });
    Render(options);
    Render({ ...options, started: false });
    expect(harness.musicPlayers[0].stop).toHaveBeenCalledOnce();
  });
});
