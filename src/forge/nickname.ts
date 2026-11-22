const adjectives = [
  "Amber",
  "Brave",
  "Bright",
  "Calm",
  "Copper",
  "Daring",
  "Golden",
  "Gentle",
  "Misty",
  "Noble",
  "Quiet",
  "Silver",
  "Swift",
  "Wild",
  "Wise",
  "Young",
] as const;
const animals = [
  "Badger",
  "Bear",
  "Crane",
  "Deer",
  "Falcon",
  "Fox",
  "Heron",
  "Lynx",
  "Otter",
  "Owl",
  "Raven",
  "Robin",
  "Stag",
  "Tiger",
  "Wolf",
  "Wren",
] as const;

export const NICKNAME_KEY = "forge-guest-nickname";

/** The seed is not an authentication credential and does not expose account IDs. */
export function nicknameFromSeed(seed: number): string {
  const value = seed >>> 0;
  return `${adjectives[value % adjectives.length]}${animals[(value >>> 4) % animals.length]}#${1000 + ((value >>> 8) % 9000)}`;
}

export function isGeneratedNickname(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Za-z]+#[0-9]{4}$/.test(value))
    return false;
  return adjectives.some((adjective) =>
    animals.some((animal) => value.startsWith(`${adjective}${animal}#`)),
  );
}

let inMemoryNickname: string | undefined;
let inMemoryBotNickname: string | undefined;

/** Keep one nickname on this device, even when storage is unavailable. */
export function getOrCreateNickname(): string {
  if (inMemoryNickname) return inMemoryNickname;
  try {
    const saved = globalThis.localStorage?.getItem(NICKNAME_KEY);
    if (isGeneratedNickname(saved)) return (inMemoryNickname = saved);
  } catch {
    // Some browsers disallow storage; keep the name for this page session.
  }
  const seed = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 0x100000000);
  inMemoryNickname = nicknameFromSeed(seed);
  try {
    globalThis.localStorage?.setItem(NICKNAME_KEY, inMemoryNickname);
  } catch {
    // The in-memory fallback remains usable.
  }
  return inMemoryNickname;
}

/** Give the bot its own stable name without sharing the human player's identity. */
export function getBotNickname(): string {
  if (inMemoryBotNickname) return inMemoryBotNickname;
  const key = "forge-bot-nickname";
  try {
    const saved = globalThis.localStorage?.getItem(key);
    if (isGeneratedNickname(saved) && saved !== getOrCreateNickname())
      return (inMemoryBotNickname = saved);
  } catch {
    // The in-memory fallback remains usable.
  }
  const human = getOrCreateNickname();
  let seed = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 0x100000000);
  do {
    inMemoryBotNickname = nicknameFromSeed(seed++);
  } while (inMemoryBotNickname === human);
  try {
    globalThis.localStorage?.setItem(key, inMemoryBotNickname);
  } catch {
    // The in-memory fallback remains usable.
  }
  return inMemoryBotNickname;
}
