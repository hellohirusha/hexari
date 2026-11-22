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
    expect(cueFiles.win).not.toBe(cueFiles.lose);
  });

  it("stops active sound effects when muted", async () => {
    const { soundCue, stopSoundEffects } = await import("../src/forge/sound");
    soundCue("roll");
    expect(players[0].play).toHaveBeenCalledOnce();
    stopSoundEffects();
    expect(players[0].pause).toHaveBeenCalledOnce();
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
