import { afterEach, expect, it, vi } from "vitest";
import handler from "../api/coach";
import { requestCoach } from "../src/shared/coachClient";
import { defaultBoard } from "../src/shared/board";
import { emptyHand } from "../src/shared/resources";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("passes a structured request through the endpoint to streamed advice", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GROQ_API_KEY", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.startsWith("https://generativelanguage.googleapis.com/")) {
        return new Response(
          'data: {"candidates":[{"content":{"parts":[{"text":"Build a road."}]},"finishReason":"STOP"}]}\n\n',
        );
      }
      expect(url).toBe("/api/coach");
      let streamController!: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
        },
      });
      const encoder = new TextEncoder();
      const res = {
        status: () => res,
        json: () => {
          throw new Error("Unexpected endpoint error");
        },
        setHeader: () => {},
        write: (chunk: string) =>
          streamController.enqueue(encoder.encode(chunk)),
        end: () => streamController.close(),
      };
      void handler(
        { method: "POST", body: JSON.parse(String(init.body)) },
        res,
      );
      return new Response(body, {
        headers: { "content-type": "text/event-stream" },
      });
    }),
  );
  const updates: string[] = [];
  const advice = await requestCoach(
    {
      board: defaultBoard,
      turn: 1,
      vp: 2,
      hand: emptyHand(),
      question: "What should I build?",
      buildings: "",
      opponents: "",
    },
    (text) => updates.push(text),
  );
  expect(advice).toBe("Build a road.");
  expect(updates).toEqual(["Build a road."]);
});
