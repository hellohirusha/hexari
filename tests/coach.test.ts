import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../api/coach";
import { defaultBoard } from "../src/shared/board";
import { emptyHand } from "../src/forge/engine";

const state = () => ({
  board: defaultBoard,
  question: "What should I build?",
  turn: 1,
  vp: 2,
  hand: emptyHand(),
  buildings: "",
  opponents: "",
  history: [],
});
function response() {
  const result = {
    code: 0,
    body: undefined as unknown,
    chunks: [] as string[],
    ended: false,
  };
  const res = {
    setHeader: vi.fn(),
    status: (code: number) => {
      result.code = code;
      return res;
    },
    json: (body: unknown) => {
      result.body = body;
    },
    write: (chunk: string) => result.chunks.push(chunk),
    end: () => {
      result.ended = true;
    },
  };
  return { res, result };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("coach endpoint", () => {
  it("streams Gemini advice across fragmented events", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GROQ_API_KEY", "");
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"candidates":[{"content":{"parts":[{"text":"Build "}]}}]}\r\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            '\r\ndata: {"candidates":[{"content":{"parts":[{"text":"a road."}]},"finishReason":"STOP"}]}\n\n',
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
    const { res, result } = response();
    await handler({ method: "POST", body: { ...state(), stream: true } }, res);
    expect(result.code).toBe(200);
    expect(result.chunks.join("")).toContain('"text":"Build a road."');
    expect(result.chunks.join("")).toContain('"type":"done"');
    expect(result.ended).toBe(true);
  });
  it("streams the backup after a Gemini rate limit", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GROQ_API_KEY", "backup-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          'data: {"choices":[{"delta":{"content":"Trade."}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { res, result } = response();
    await handler({ method: "POST", body: { ...state(), stream: true } }, res);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(fetchMock.mock.calls[1][1].body).max_completion_tokens,
    ).toBe(4096);
    expect(result.chunks.join("")).toContain('"text":"Trade."');
    expect(result.chunks.join("")).toContain('"type":"done"');
  });
  it("streams the backup when Gemini cannot be reached", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GROQ_API_KEY", "backup-key");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network timeout"))
      .mockResolvedValueOnce(
        new Response(
          'data: {"choices":[{"delta":{"content":"Trade."}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { res, result } = response();
    await handler({ method: "POST", body: { ...state(), stream: true } }, res);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.chunks.join("")).toContain('"text":"Trade."');
    expect(result.chunks.join("")).toContain('"type":"done"');
  });
  it("uses the backup when Gemini finishes without producing advice", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GROQ_API_KEY", "backup-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("data: [DONE]\n\n"))
      .mockResolvedValueOnce(
        new Response(
          'data: {"choices":[{"delta":{"content":"Trade."}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { res, result } = response();
    await handler({ method: "POST", body: { ...state(), stream: true } }, res);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.chunks.join("")).toContain('"text":"Trade."');
    expect(result.chunks.join("")).toContain('"type":"done"');
  });
  it("does not mix providers after advice has been shown", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GROQ_API_KEY", "backup-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          'data: {"candidates":[{"content":{"parts":[{"text":"Build a road.\\n"}]}}]}\n\n',
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { res, result } = response();
    await handler({ method: "POST", body: { ...state(), stream: true } }, res);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.chunks.join("")).toContain('"text":"Build a road."');
    expect(result.chunks.join("")).toContain('"type":"error"');
  });
  it("limits streamed advice to five short points, even across chunks", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GROQ_API_KEY", "");
    const parts = [
      "1. Build a road.\n2. This point contains far too many words for the player to receive it safely.\n3. Save ",
      "wheat.\n4. Trade brick.\n5. Upgrade a settlement.\n6. Watch your hand.\n7. Gather ore.",
    ];
    const frames = parts
      .map(
        (text, index) =>
          `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, ...(index === 1 ? { finishReason: "STOP" } : {}) }] })}\n\n`,
      )
      .join("");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(frames)));
    const { res, result } = response();
    await handler({ method: "POST", body: { ...state(), stream: true } }, res);
    const events = result.chunks.map((chunk) => JSON.parse(chunk.slice(6)));
    const advice = events
      .filter((event) => event.type === "delta")
      .map((event) => event.text)
      .join("");
    expect(advice.split("\n")).toEqual([
      "Build a road.",
      "Save wheat.",
      "Trade brick.",
      "Upgrade a settlement.",
      "Watch your hand.",
    ]);
    expect(events.at(-1)).toEqual({ type: "done" });
  });
  it("limits non-streamed advice and asks the provider for short sentences", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: [
                    "One two three four five six seven eight nine ten eleven twelve.",
                    "One two three four five six seven eight nine ten eleven twelve thirteen.",
                    "Build a road. Save wheat.",
                    "Trade brick.",
                    "Gather ore.",
                    "Watch your hand.",
                  ].join("\n"),
                },
              ],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { res, result } = response();
    await handler({ method: "POST", body: state() }, res);
    expect(result.body).toEqual({
      advice: [
        "One two three four five six seven eight nine ten eleven twelve.",
        "Build a road.",
        "Save wheat.",
        "Trade brick.",
        "Gather ore.",
      ].join("\n"),
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.contents[0].parts[0].text).toContain(
      "no more than 12 words",
    );
  });
  it("does not return a response containing only oversized advice", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "One two three four five six seven eight nine ten eleven twelve thirteen.",
                  },
                ],
              },
            },
          ],
        }),
      ),
    );
    const { res, result } = response();
    await handler({ method: "POST", body: state() }, res);
    expect(result.code).toBe(502);
    expect(result.body).toEqual({ error: "The model returned no advice." });
  });
  it("reports an interrupted stream rather than saving incomplete advice", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            'data: {"candidates":[{"content":{"parts":[{"text":"Build"}]}}]}\n\n',
          ),
        ),
    );
    const { res, result } = response();
    await handler({ method: "POST", body: { ...state(), stream: true } }, res);
    expect(result.chunks.join("")).toContain('"type":"error"');
    expect(result.chunks.join("")).not.toContain('"type":"done"');
  });
  it("rejects cross-site browser requests before calling a provider", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { res, result } = response();
    await handler(
      {
        method: "POST",
        body: state(),
        headers: { "sec-fetch-site": "cross-site" },
      },
      res,
    );
    expect(result.code).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects producing tiles without a number before contacting a provider", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { res, result } = response();
    const board = defaultBoard.map((tile, index) =>
      index === 0 ? { ...tile, number: null } : tile,
    );
    await handler({ method: "POST", body: { ...state(), board } }, res);
    expect(result.code).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("accepts an unknown turn number for a saved Forge game", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "Build a road." }] } }],
        }),
      }),
    );
    const { res, result } = response();
    await handler({ method: "POST", body: { ...state(), turn: null } }, res);
    expect(result.code).toBe(200);
    expect(result.body).toEqual({ advice: "Build a road." });
  });
  it("rejects malformed hands before calling a provider", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { res, result } = response();
    await handler(
      { method: "POST", body: { ...state(), hand: { wood: -1 } } },
      res,
    );
    expect(result.code).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([429, 503])(
    "falls back to Groq on a Gemini %s response",
    async (status) => {
      vi.stubEnv("GEMINI_API_KEY", "test-key");
      vi.stubEnv("GROQ_API_KEY", "backup-key");
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "Build a road." } }],
          }),
        });
      vi.stubGlobal("fetch", fetchMock);
      const { res, result } = response();
      await handler({ method: "POST", body: state() }, res);
      expect(result.code).toBe(200);
      expect(result.body).toEqual({ advice: "Build a road." });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );
  it("uses the backup for a non-streamed Gemini network failure", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GROQ_API_KEY", "backup-key");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network timeout"))
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: "Build a road." } }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { res, result } = response();
    await handler({ method: "POST", body: state() }, res);
    expect(result.body).toEqual({ advice: "Build a road." });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("falls back to Groq on a Gemini service outage", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GROQ_API_KEY", "backup-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          'data: {"choices":[{"delta":{"content":"Build a road."}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { res, result } = response();
    await handler({ method: "POST", body: { ...state(), stream: true } }, res);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.chunks.join("")).toContain('"text":"Build a road."');
    expect(result.chunks.join("")).toContain('"type":"done"');
  });
  it("does not fall back on a Gemini authentication error", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GROQ_API_KEY", "backup-key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);
    const { res, result } = response();
    await handler({ method: "POST", body: state() }, res);
    expect(result.code).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
