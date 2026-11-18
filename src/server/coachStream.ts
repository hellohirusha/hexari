import { eventData } from "../shared/eventStream";

type StreamResponse = {
  status: (n: number) => StreamResponse;
  json: (value: unknown) => void;
  setHeader: (name: string, value: string) => void;
  write?: (chunk: string) => unknown;
  end?: () => void;
};

export async function streamCoach(
  prompt: string,
  res: StreamResponse,
  env: Record<string, string | undefined>,
) {
  if (!res.write || !res.end) {
    res.status(500).json({ error: "Streaming is unavailable." });
    return;
  }
  const groq = () =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL || "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        stream: true,
        max_completion_tokens: 512,
      }),
      signal: AbortSignal.timeout(30000),
    });
  let provider: "gemini" | "groq" = env.GEMINI_API_KEY ? "gemini" : "groq";
  let response: globalThis.Response;
  try {
    response =
      provider === "gemini"
        ? await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL || "gemini-3.8-flash")}:streamGenerateContent?alt=sse`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": env.GEMINI_API_KEY!,
              },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: 512 },
              }),
              signal: AbortSignal.timeout(30000),
            },
          )
        : await groq();
    if (provider === "gemini" && response.status === 429 && env.GROQ_API_KEY) {
      await response.body?.cancel();
      provider = "groq";
      response = await groq();
    }
  } catch {
    res
      .status(502)
      .json({ error: "The coach could not reach the model service." });
    return;
  }
  if (!response.ok || !response.body) {
    res.status(502).json({
      error: "The model service could not respond. Please try again later.",
    });
    return;
  }
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  const send = (event: object) =>
    res.write!(`data: ${JSON.stringify(event)}\n\n`);
  let length = 0;
  let finished = false;
  try {
    for await (const frame of eventData(response.body)) {
      if (frame === "[DONE]") {
        break;
      }
      const data = JSON.parse(frame) as {
        candidates?: {
          finishReason?: string;
          content?: { parts?: { text?: string }[] };
        }[];
        choices?: {
          finish_reason?: string | null;
          delta?: { content?: string };
        }[];
        error?: unknown;
      };
      if (data.error) throw new Error("Provider stream failed.");
      const text =
        provider === "gemini"
          ? data.candidates?.[0]?.content?.parts
              ?.map((part) => part.text ?? "")
              .join("")
          : data.choices?.[0]?.delta?.content;
      if (text) {
        length += text.length;
        if (length > 6000) throw new Error("Provider response too long.");
        send({ type: "delta", text });
      }
      if (
        provider === "gemini" &&
        data.candidates?.[0]?.finishReason === "STOP"
      )
        finished = true;
      if (provider === "groq" && data.choices?.[0]?.finish_reason === "stop")
        finished = true;
    }
    if (!length || !finished) throw new Error("Incomplete response.");
    send({ type: "done" });
  } catch {
    send({ type: "error" });
  } finally {
    res.end();
  }
}
