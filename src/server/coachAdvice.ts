const MAX_POINTS = 5;
const MAX_WORDS = 12;

function advicePoints(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .replace(/([.!?])\s+(?=\d{1,2}[.)]\s)/g, "$1\n")
    .split("\n")
    .flatMap((line) => {
      const cleaned = line
        .trim()
        .replace(/^(?:(?:[-*•]|\d{1,2}[.)])\s+)+/, "")
        .replace(/\*\*/g, "")
        .replace(/`/g, "")
        .trim();
      return cleaned.split(/(?<=[.!?])\s+/);
    })
    .map((point) => point.trim())
    .filter(
      (point) =>
        point.length > 0 &&
        !point.endsWith(":") &&
        point.split(/\s+/).length <= MAX_WORDS,
    );
}

export function formatCoachAdvice(text: string): string {
  return advicePoints(text).slice(0, MAX_POINTS).join("\n");
}

// Wait for complete lines before sending them, so partial or oversized advice
// is never shown while a provider is still generating a sentence.
export class CoachAdviceStream {
  private pending = "";
  private count = 0;

  push(text: string, finished = false): string[] {
    this.pending += text;
    const end = finished
      ? this.pending.length
      : this.pending.lastIndexOf("\n") + 1;
    if (!end) return [];
    const complete = this.pending.slice(0, end);
    this.pending = this.pending.slice(end);
    const points = advicePoints(complete).slice(0, MAX_POINTS - this.count);
    this.count += points.length;
    return points;
  }
}
