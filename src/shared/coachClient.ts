import { eventData } from "./eventStream";

export async function requestCoach(
  state: object,
  onUpdate: (advice: string) => void,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/coach", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ ...state, stream: true }),
    signal,
  });
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    throw new Error(
      data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
        ? data.error
        : "Coach service is unavailable. Try again later.",
    );
  }
  if (
    !response.headers.get("content-type")?.includes("text/event-stream") ||
    !response.body
  )
    throw new Error("Coach service is unavailable. Try again later.");
  let advice = "";
  let complete = false;
  for await (const data of eventData(response.body)) {
    const event: unknown = JSON.parse(data);
    if (!event || typeof event !== "object" || !("type" in event))
      throw new Error("Invalid coach response.");
    if (
      event.type === "delta" &&
      "text" in event &&
      typeof event.text === "string"
    ) {
      advice += event.text;
      if (advice.length > 6000) throw new Error("Coach response is too long.");
      onUpdate(advice);
    } else if (event.type === "done") {
      complete = true;
      break;
    } else if (event.type === "error") {
      throw new Error("Coach response was interrupted. Please try again.");
    } else throw new Error("Invalid coach response.");
  }
  if (!complete || !advice.trim())
    throw new Error("Coach response was interrupted. Please try again.");
  return advice.trim();
}
