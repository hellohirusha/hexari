import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Forge audio", () => {
  const players: FakeAudio[] = [];
  let rejectNextPlay = false;
  let rejectionName = "NotAllowedError";

  class FakeAudio extends EventTarget {
    src: string;
    volume = 1;
    loop = false;
    paused = true;
    preload = "";
    currentTime = 0;
    load = vi.fn();
    play = vi.fn(async () => {
      if (rejectNextPlay) {
        rejectNextPlay = false;
        throw new DOMException("playback failed", rejectionName);
      }
      this.paused = false;
    });
    pause = vi.fn(() => {
      this.paused = true;
    });
    constructor(src: string) {
      super();
      this.src = src;
      players.push(this);
    }
  }

  beforeEach(() => {
    vi.resetModules();
    players.length = 0;
    rejectNextPlay = false;
    rejectionName = "NotAllowedError";
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("Audio", FakeAudio);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses recordings appropriate to resources and outcomes", async () => {
    const { cueFiles } = await import("../src/forge/sound");
    expect(cueFiles.roll).toContain("dice-throw");
    expect(cueFiles.wood).toContain("chop");
    expect(cueFiles.ore).toContain("Mining");
    expect(cueFiles.sheep).toContain("sheep");
    expect(cueFiles.win).toContain("crowd-cheer.ogg");
    expect(cueFiles.lose).toContain("game-over.ogg");
    expect(
      new Set([cueFiles.road, cueFiles.settlement, cueFiles.city]).size,
    ).toBe(3);
    expect(cueFiles.settlementSelect).not.toBe(cueFiles.citySelect);
  });

  it("stops active sound effects when muted", async () => {
    const { soundCue, stopSoundEffects } = await import("../src/forge/sound");
    soundCue("roll");
    expect(players[0].play).toHaveBeenCalledOnce();
    stopSoundEffects();
    expect(players[0].pause).toHaveBeenCalledOnce();
  });

  it("prepares placement sounds once and reuses them without interrupting overlapping sounds", async () => {
    const { preparePlacementSounds, soundCue, stopSoundEffects } =
      await import("../src/forge/sound");
    preparePlacementSounds();
    preparePlacementSounds();
    expect(players).toHaveLength(5);
    expect(players.every((audio) => audio.preload === "auto")).toBe(true);
    expect(players.every((audio) => audio.load.mock.calls.length === 1)).toBe(
      true,
    );
    expect(players.every((audio) => audio.play.mock.calls.length === 0)).toBe(
      true,
    );

    const road = players[0];
    soundCue("road");
    expect(road.play).toHaveBeenCalledOnce();
    soundCue("road");
    expect(players).toHaveLength(6);
    expect(players[5].play).toHaveBeenCalledOnce();

    road.currentTime = 1;
    road.dispatchEvent(new Event("ended"));
    soundCue("road");
    expect(road.currentTime).toBe(0);
    expect(road.play).toHaveBeenCalledTimes(2);
    stopSoundEffects();
    expect(road.pause).toHaveBeenCalledOnce();
    expect(players[5].pause).toHaveBeenCalledOnce();
  });

  it("plays distinct preloaded board sounds with adjustable volume", async () => {
    const {
      cueFiles,
      preparePlacementSounds,
      setMasterVolume,
      soundCue,
      stopSoundEffects,
    } = await import("../src/forge/sound");
    preparePlacementSounds();
    const cues = [
      "road",
      "settlement",
      "city",
      "settlementSelect",
      "citySelect",
    ] as const;
    for (const [index, cue] of cues.entries()) {
      expect(players[index].src).toBe(cueFiles[cue]);
      soundCue(cue);
    }
    const voice = (cue: (typeof cues)[number]) => players[cues.indexOf(cue)];

    expect(voice("road").volume).toBe(0.75);
    expect(voice("settlement").volume).toBe(0.85);
    expect(voice("city").volume).toBe(0.85);
    expect(voice("settlementSelect").volume).toBe(0.6);
    expect(voice("citySelect").volume).toBe(0.65);
    expect(players).toHaveLength(5);
    expect(players.every((audio) => audio.play.mock.calls.length === 1)).toBe(
      true,
    );

    setMasterVolume(0.5);
    expect(voice("settlement").volume).toBeCloseTo(0.425);
    setMasterVolume(0);
    expect(players.every((audio) => audio.volume === 0)).toBe(true);
    stopSoundEffects();
    expect(players.every((audio) => audio.paused)).toBe(true);
  });

  it("ignores a late playback failure from a stopped sound after the voice is reused", async () => {
    const {
      startWelcomeMusic,
      preparePlacementSounds,
      soundCue,
      stopSoundEffects,
    } = await import("../src/forge/sound");
    const music = startWelcomeMusic();
    preparePlacementSounds();
    rejectNextPlay = true;
    soundCue("road");
    stopSoundEffects();
    soundCue("road");
    await Promise.resolve();
    await Promise.resolve();
    expect(players[0].volume).toBeLessThan(0.45);
    players[1].dispatchEvent(new Event("ended"));
    expect(players[0].volume).toBe(0.45);
    music.stop();
  });

  it("ducks music until all overlapping effects finish, including failed playback", async () => {
    const { startWelcomeMusic, soundCue } = await import("../src/forge/sound");
    const music = startWelcomeMusic();
    await Promise.resolve();
    soundCue("roll");
    soundCue("road");
    expect(players[0].volume).toBeLessThan(0.45);
    players[1].dispatchEvent(new Event("ended"));
    expect(players[0].volume).toBeLessThan(0.45);
    players[2].dispatchEvent(new Event("ended"));
    expect(players[0].volume).toBe(0.45);
    rejectNextPlay = true;
    soundCue("roll");
    await Promise.resolve();
    await Promise.resolve();
    expect(players[0].volume).toBe(0.45);
    music.stop();
  });

  it("cancels delayed bot sounds when muted", async () => {
    vi.useFakeTimers();
    const { scheduleSoundCue, stopSoundEffects } =
      await import("../src/forge/sound");
    scheduleSoundCue("road", 500);
    stopSoundEffects();
    vi.advanceTimersByTime(500);
    expect(players).toHaveLength(0);
  });

  it("adjusts the volume of music and active effects", async () => {
    const { startWelcomeMusic, soundCue, setMasterVolume } =
      await import("../src/forge/sound");
    const music = startWelcomeMusic();
    soundCue("roll");
    setMasterVolume(0.5);
    expect(players[0].volume).toBeCloseTo(0.08);
    expect(players[1].volume).toBeCloseTo(0.275);
    players[1].dispatchEvent(new Event("ended"));
    expect(players[0].volume).toBeCloseTo(0.225);
    music.stop();
  });

  it("loops welcome music and removes it on cleanup", async () => {
    const { startWelcomeMusic } = await import("../src/forge/sound");
    const player = startWelcomeMusic();
    expect(players[0].loop).toBe(true);
    expect(players[0].play).toHaveBeenCalledOnce();
    await Promise.resolve();
    player.stop();
    expect(players[0].pause).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event("pointerdown"));
    expect(players[0].play).toHaveBeenCalledOnce();
  });

  it("plays the result music and immediately restarts the welcome loop when returning", async () => {
    const { startWelcomeMusic, startResultMusic, soundCue, setMasterVolume } =
      await import("../src/forge/sound");
    const result = startResultMusic();
    expect(players[0].src).toContain("welcome-music.ogg");
    expect(players[0].loop).toBe(true);
    expect(players[0].play).toHaveBeenCalledOnce();
    soundCue("win");
    expect(players[0].volume).toBeLessThan(0.45);
    setMasterVolume(0.5);
    players[1].dispatchEvent(new Event("ended"));
    expect(players[0].volume).toBeCloseTo(0.225);
    result.stop();
    expect(players[0].paused).toBe(true);

    const welcome = startWelcomeMusic();
    expect(players[2].src).toContain("crowded-pub.ogg");
    expect(players[2].play).toHaveBeenCalledOnce();
    expect(players[2].paused).toBe(false);
    welcome.stop();
  });

  it.each(["win", "lose"] as const)(
    "plays the %s cue before starting the result music",
    async (outcome) => {
      const { cueFiles, startResultAudio } = await import("../src/forge/sound");
      const result = startResultAudio(outcome);
      expect(players).toHaveLength(1);
      expect(players[0].src).toBe(cueFiles[outcome]);
      expect(players[0].play).toHaveBeenCalledOnce();
      players[0].dispatchEvent(new Event("ended"));
      expect(players).toHaveLength(2);
      expect(players[1].src).toContain("welcome-music.ogg");
      expect(players[1].loop).toBe(true);
      expect(players[1].play).toHaveBeenCalledOnce();
      result.stop();
      expect(players[1].paused).toBe(true);
    },
  );

  it("preloads outcome sounds once and reuses them when results reopen", async () => {
    const { prepareResultSounds, startResultAudio } =
      await import("../src/forge/sound");
    prepareResultSounds();
    prepareResultSounds();
    expect(players).toHaveLength(2);
    expect(players.every((audio) => audio.preload === "auto")).toBe(true);
    expect(players.every((audio) => audio.load.mock.calls.length === 1)).toBe(
      true,
    );
    const first = startResultAudio("win");
    expect(players[0].play).toHaveBeenCalledOnce();
    players[0].currentTime = 3;
    players[0].dispatchEvent(new Event("ended"));
    first.stop();
    const second = startResultAudio("win");
    expect(players[0].currentTime).toBe(0);
    expect(players[0].play).toHaveBeenCalledTimes(2);
    second.stop();
  });

  it("selects each player's result sound, with shared-device games celebrating the winner", async () => {
    const { resultSound } = await import("../src/forge/sound");
    expect(resultSound(0, "bot")).toBe("win");
    expect(resultSound(1, "bot")).toBe("lose");
    expect(resultSound(1, "online", 1)).toBe("win");
    expect(resultSound(1, "online", 0)).toBe("lose");
    expect(resultSound(0, "online")).toBeNull();
    expect(resultSound(1, "hotseat")).toBe("win");
  });

  it("starts music after a stalled result cue times out", async () => {
    vi.useFakeTimers();
    const { startResultAudio, setMasterVolume } =
      await import("../src/forge/sound");
    const result = startResultAudio("win");
    await vi.advanceTimersByTimeAsync(7999);
    expect(players).toHaveLength(1);
    setMasterVolume(0.5);
    expect(players[0].volume).toBeCloseTo(0.2);
    await vi.advanceTimersByTimeAsync(1);
    expect(players[0].paused).toBe(true);
    expect(players[1].src).toContain("welcome-music.ogg");
    expect(players[1].volume).toBeCloseTo(0.225);
    result.stop();
  });

  it("does not start result music after the result audio is stopped", async () => {
    vi.useFakeTimers();
    const { startResultAudio, stopSoundEffects } =
      await import("../src/forge/sound");
    const closed = startResultAudio("lose");
    closed.stop();
    players[0].dispatchEvent(new Event("ended"));
    await vi.advanceTimersByTimeAsync(9000);
    expect(players).toHaveLength(1);

    const muted = startResultAudio("win");
    stopSoundEffects();
    await vi.advanceTimersByTimeAsync(9000);
    expect(players).toHaveLength(2);
    muted.stop();
  });

  it("starts the result music if the cue cannot be played", async () => {
    const { startResultAudio } = await import("../src/forge/sound");
    rejectNextPlay = true;
    const result = startResultAudio("lose");
    await Promise.resolve();
    await Promise.resolve();
    expect(players[1].src).toContain("welcome-music.ogg");
    expect(players[1].play).toHaveBeenCalledOnce();
    result.stop();
  });

  it("retries blocked welcome music after a user gesture", async () => {
    const { startWelcomeMusic } = await import("../src/forge/sound");
    rejectNextPlay = true;
    const onStatus = vi.fn();
    const player = startWelcomeMusic(onStatus);
    await Promise.resolve();
    await Promise.resolve();
    expect(onStatus).toHaveBeenCalledWith("blocked");
    players[0].paused = true;
    window.dispatchEvent(new Event("pointerdown"));
    expect(players[0].play).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    expect(onStatus).toHaveBeenCalledWith("playing");
    player.stop();
  });

  it("does not restart blocked welcome music after leaving the welcome screen", async () => {
    const { startWelcomeMusic } = await import("../src/forge/sound");
    rejectNextPlay = true;
    const player = startWelcomeMusic();
    await Promise.resolve();
    await Promise.resolve();
    player.stop();
    window.dispatchEvent(new Event("pointerdown"));
    player.play();
    await Promise.resolve();
    expect(players[0].paused).toBe(true);
    expect(players[0].play).toHaveBeenCalledOnce();
  });

  it("retries a transient startup failure without a click and stops retrying after cleanup", async () => {
    vi.useFakeTimers();
    const { startWelcomeMusic } = await import("../src/forge/sound");
    rejectNextPlay = true;
    rejectionName = "AbortError";
    const player = startWelcomeMusic();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(250);
    expect(players[0].play).toHaveBeenCalledTimes(2);
    expect(players[0].paused).toBe(false);
    player.stop();

    rejectNextPlay = true;
    const stopped = startWelcomeMusic();
    await Promise.resolve();
    await Promise.resolve();
    stopped.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(players[1].play).toHaveBeenCalledOnce();
  });
});
