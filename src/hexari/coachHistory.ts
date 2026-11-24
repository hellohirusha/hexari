export type CoachEntry = { board: string; question: string; advice: string };

const historyKey = "hexari-coach-v1";

export function readCoachHistory(): CoachEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(historyKey) ?? "[]");
    return Array.isArray(value)
      ? value
          .filter((entry): entry is CoachEntry =>
            Boolean(
              entry &&
              typeof entry.board === "string" &&
              typeof entry.question === "string" &&
              typeof entry.advice === "string",
            ),
          )
          .slice(-12)
      : [];
  } catch {
    return [];
  }
}

export function writeCoachHistory(history: CoachEntry[]) {
  try {
    localStorage.setItem(historyKey, JSON.stringify(history));
  } catch {
    // The current session remains usable if browser storage is unavailable.
  }
}
