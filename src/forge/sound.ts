export type Cue =
  | "start"
  | "roll"
  | "road"
  | "settlement"
  | "city"
  | "settlementSelect"
  | "citySelect"
  | "trade"
  | "bank"
  | "discard"
  | "turn"
  | "win"
  | "lose"
  | "blocked"
  | "error"
  | "select"
  | "message"
  | "timeout"
  | "wood"
  | "brick"
  | "wheat"
  | "ore"
  | "sheep";

// Local audio files keep playback independent of external services at runtime.
export const cueFiles: Record<Cue, string> = {
  start: new URL("./assets/audio/rpg-audio_bookOpen.ogg", import.meta.url).href,
  roll: new URL("./assets/audio/casino-audio_dice-throw-1.ogg", import.meta.url)
    .href,
  road: new URL(
    "./assets/audio/impact-sounds_impactWood_light_000.ogg",
    import.meta.url,
  ).href,
  settlement: new URL(
    "./assets/audio/impact-sounds_impactPlank_medium_000.ogg",
    import.meta.url,
  ).href,
  city: new URL(
    "./assets/audio/impact-sounds_impactPlate_medium_000.ogg",
    import.meta.url,
  ).href,
  settlementSelect: new URL(
    "./assets/audio/impact-sounds_impactWood_light_000.ogg",
    import.meta.url,
  ).href,
  citySelect: new URL(
    "./assets/audio/impact-sounds_impactPlate_medium_000.ogg",
    import.meta.url,
  ).href,
  trade: new URL(
    "./assets/audio/casino-audio_card-shove-2.ogg",
    import.meta.url,
  ).href,
  bank: new URL("./assets/audio/rpg-audio_handleCoins2.ogg", import.meta.url)
    .href,
  discard: new URL(
    "./assets/audio/casino-audio_card-place-2.ogg",
    import.meta.url,
  ).href,
  turn: new URL("./assets/audio/casino-audio_card-slide-4.ogg", import.meta.url)
    .href,
  win: new URL("./assets/audio/victory.ogg", import.meta.url).href,
  lose: new URL("./assets/audio/defeat.ogg", import.meta.url).href,
  blocked: new URL(
    "./assets/audio/impact-sounds_impactGeneric_light_000.ogg",
    import.meta.url,
  ).href,
  error: new URL(
    "./assets/audio/interface-sounds_error_003.ogg",
    import.meta.url,
  ).href,
  select: new URL("./assets/audio/casino-audio_chip-lay-2.ogg", import.meta.url)
    .href,
  message: new URL("./assets/audio/rpg-audio_bookFlip3.ogg", import.meta.url)
    .href,
  timeout: new URL(
    "./assets/audio/impact-sounds_impactBell_heavy_000.ogg",
    import.meta.url,
  ).href,
  wood: new URL("./assets/audio/rpg-audio_chop.ogg", import.meta.url).href,
  brick: new URL(
    "./assets/audio/impact-sounds_impactPlate_medium_000.ogg",
    import.meta.url,
  ).href,
  wheat: new URL("./assets/audio/leaves.ogg", import.meta.url).href,
  ore: new URL(
    "./assets/audio/impact-sounds_impactMining_000.ogg",
    import.meta.url,
  ).href,
  sheep: new URL("./assets/audio/sheep.ogg", import.meta.url).href,
};

const welcomeMusic = new URL("./assets/audio/crowded-pub.ogg", import.meta.url)
  .href;
const resultMusic = new URL("./assets/audio/welcome-music.ogg", import.meta.url)
  .href;
type PlayingEffect = { baseVolume: number; finish: () => void };
const playingEffects = new Map<HTMLAudioElement, PlayingEffect>();
const preparedPlacements = new Map<Cue, HTMLAudioElement>();
const preparedResults = new Map<"win" | "lose", HTMLAudioElement>();
const scheduledEffects = new Set<ReturnType<typeof setTimeout>>();
let backgroundMusic: HTMLAudioElement | null = null;
const musicVolume = 0.45;
const musicDuckedVolume = 0.16;
let masterVolume = 1;
const volumes: Partial<Record<Cue, number>> = {
  road: 0.75,
  settlement: 0.85,
  city: 0.85,
  settlementSelect: 0.6,
  citySelect: 0.65,
  sheep: 0.35,
  wheat: 0.4,
  ore: 0.45,
  win: 0.4,
  lose: 0.4,
  timeout: 0.35,
};

/** Prepare board feedback sounds before they are needed, without playing them. */
export function preparePlacementSounds() {
  for (const cue of [
    "road",
    "settlement",
    "city",
    "settlementSelect",
    "citySelect",
  ] as const) {
    if (preparedPlacements.has(cue)) continue;
    try {
      const audio = new Audio(cueFiles[cue]);
      audio.preload = "auto";
      audio.load();
      preparedPlacements.set(cue, audio);
    } catch {
      // Playback remains best-effort if preparation is unavailable.
    }
  }
}

/** Preload the remaining interaction sounds before players need them. */
export function prepareSoundEffects() {
  preparePlacementSounds();
  for (const cue of Object.keys(cueFiles) as Cue[]) {
    if (cue === "win" || cue === "lose" || preparedPlacements.has(cue))
      continue;
    try {
      const audio = new Audio(cueFiles[cue]);
      audio.preload = "auto";
      audio.load();
      preparedPlacements.set(cue, audio);
    } catch {
      // Playback remains best-effort if preparation is unavailable.
    }
  }
}

/** Load the short outcome cues before the result screen appears. */
export function prepareResultSounds() {
  for (const outcome of ["win", "lose"] as const) {
    if (preparedResults.has(outcome)) continue;
    try {
      const audio = new Audio(cueFiles[outcome]);
      audio.preload = "auto";
      audio.load();
      preparedResults.set(outcome, audio);
    } catch {
      // The result sequence can still create a player when needed.
    }
  }
}

/** Playback is best-effort; a blocked or missing audio device must not interrupt play. */
export function soundCue(kind: Cue) {
  let finish = () => {};
  try {
    const prepared = preparedPlacements.get(kind);
    const audio =
      prepared && !playingEffects.has(prepared)
        ? prepared
        : new Audio(cueFiles[kind]);
    if (audio.currentTime) audio.currentTime = 0;
    const baseVolume = volumes[kind] ?? 0.55;
    audio.volume = baseVolume * masterVolume;
    const effect: PlayingEffect = { baseVolume, finish: () => {} };
    playingEffects.set(audio, effect);
    if (backgroundMusic)
      backgroundMusic.volume = musicDuckedVolume * masterVolume;
    finish = () => {
      if (playingEffects.get(audio) !== effect) return;
      audio.removeEventListener("ended", finish);
      audio.removeEventListener("error", finish);
      playingEffects.delete(audio);
      if (backgroundMusic && playingEffects.size === 0)
        backgroundMusic.volume = musicVolume * masterVolume;
    };
    effect.finish = finish;
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    void audio.play().catch(finish);
  } catch {
    finish();
  }
}

export function setMasterVolume(volume: number) {
  masterVolume = Math.max(0, Math.min(1, volume));
  for (const [audio, effect] of playingEffects)
    audio.volume = effect.baseVolume * masterVolume;
  if (backgroundMusic)
    backgroundMusic.volume =
      (playingEffects.size ? musicDuckedVolume : musicVolume) * masterVolume;
}

export function scheduleSoundCue(kind: Cue, delay: number) {
  const timer = setTimeout(() => {
    scheduledEffects.delete(timer);
    soundCue(kind);
  }, delay);
  scheduledEffects.add(timer);
}

export function stopSoundEffects() {
  for (const timer of scheduledEffects) clearTimeout(timer);
  scheduledEffects.clear();
  for (const [audio, effect] of playingEffects) {
    audio.pause();
    effect.finish();
  }
  if (backgroundMusic) backgroundMusic.volume = musicVolume * masterVolume;
}

export type WelcomeMusicStatus = "playing" | "blocked" | "unavailable";
export type WelcomeMusicPlayer = { play: () => void; stop: () => void };

/** Start immediately, retry transient failures, and retry blocked playback on interaction. */
function startMusic(
  source: string,
  onStatus: (status: WelcomeMusicStatus) => void,
): WelcomeMusicPlayer {
  try {
    const audio = new Audio(source);
    backgroundMusic = audio;
    audio.loop = true;
    audio.volume =
      (playingEffects.size ? musicDuckedVolume : musicVolume) * masterVolume;
    let active = true;
    let attempt = 0;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const begin = () => {
      if (!active || !audio.paused) return;
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      const currentAttempt = ++attempt;
      void audio
        .play()
        .then(() => {
          if (!active) audio.pause();
          else if (currentAttempt === attempt) onStatus("playing");
        })
        .catch((error: unknown) => {
          if (!active || currentAttempt !== attempt) return;
          console.warn("Forge music playback failed:", error);
          const blocked =
            error &&
            typeof error === "object" &&
            "name" in error &&
            error.name === "NotAllowedError";
          onStatus(blocked ? "blocked" : "unavailable");
          if (!blocked && retryCount < 2) {
            retryTimer = setTimeout(begin, 250 * 2 ** retryCount++);
          }
        });
    };
    window.addEventListener("pointerdown", begin);
    window.addEventListener("keydown", begin);
    begin();
    return {
      play: begin,
      stop: () => {
        active = false;
        if (retryTimer !== undefined) clearTimeout(retryTimer);
        window.removeEventListener("pointerdown", begin);
        window.removeEventListener("keydown", begin);
        audio.pause();
        if (backgroundMusic === audio) backgroundMusic = null;
      },
    };
  } catch {
    queueMicrotask(() => onStatus("unavailable"));
    return { play: () => {}, stop: () => {} };
  }
}

export function startWelcomeMusic(
  onStatus: (status: WelcomeMusicStatus) => void = () => {},
): WelcomeMusicPlayer {
  return startMusic(welcomeMusic, onStatus);
}

/** The result screen uses a separate ambient loop from the welcome screen. */
export function startResultMusic(
  onStatus: (status: WelcomeMusicStatus) => void = () => {},
): WelcomeMusicPlayer {
  return startMusic(resultMusic, onStatus);
}

/** Select the result sound from the local player's perspective. */
export function resultSound(
  winner: number,
  opponent: "bot" | "hotseat" | "online",
  seat?: number,
): "win" | "lose" | null {
  if (opponent === "hotseat") return "win";
  if (opponent === "online" && seat === undefined) return null;
  const player = opponent === "bot" ? 0 : seat;
  return winner === player ? "win" : "lose";
}

/** Play a brief result cue before starting the result-screen ambience. */
export function startResultAudio(outcome: "win" | "lose"): WelcomeMusicPlayer {
  let active = true;
  let music: WelcomeMusicPlayer | null = null;
  let cue: HTMLAudioElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let effect: PlayingEffect | null = null;

  const clearCue = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!cue) return;
    cue.removeEventListener("ended", finishCue);
    cue.removeEventListener("error", finishCue);
    cue.pause();
    if (playingEffects.get(cue) === effect) playingEffects.delete(cue);
    cue = null;
    effect = null;
  };
  const finishCue = () => {
    if (!active || !cue) return;
    clearCue();
    music = startResultMusic();
  };

  try {
    const prepared = preparedResults.get(outcome);
    cue =
      prepared && !playingEffects.has(prepared)
        ? prepared
        : new Audio(cueFiles[outcome]);
    const current = cue;
    if (current.currentTime) current.currentTime = 0;
    const baseVolume = volumes[outcome] ?? 0.55;
    current.volume = baseVolume * masterVolume;
    effect = { baseVolume, finish: clearCue };
    playingEffects.set(current, effect);
    current.addEventListener("ended", finishCue, { once: true });
    current.addEventListener("error", finishCue, { once: true });
    // Don't leave the result silent indefinitely if the audio never ends.
    timer = setTimeout(finishCue, 8000);
    void current.play().catch(finishCue);
  } catch {
    clearCue();
    if (active) music = startResultMusic();
  }

  return {
    play: () => music?.play(),
    stop: () => {
      active = false;
      clearCue();
      music?.stop();
    },
  };
}
