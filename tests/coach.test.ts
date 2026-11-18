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
    expect(result.chunks.join("")).toContain('"text":"Build "');
    expect(result.chunks.join("")).toContain('"text":"a road."');
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
    expect(result.chunks.join("")).toContain('"text":"Trade."');
    expect(result.chunks.join("")).toContain('"type":"done"');
  });
  it("reports an interrupted stream rather than saving incomplete advice", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
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
  it("falls back to Groq on a Gemini rate limit", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GROQ_API_KEY", "backup-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
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
  });
  it("does not fall back on an unrelated provider error", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GROQ_API_KEY", "backup-key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);
    const { res, result } = response();
    await handler({ method: "POST", body: state() }, res);
    expect(result.code).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
