import { afterEach, expect, it, vi } from "vitest";
import { localCoachPlugin } from "../src/server/localCoachPlugin";
import { defaultBoard } from "../src/forge/board";
import { emptyHand } from "../src/shared/resources";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("serves the Forge coach request through the local middleware", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GROQ_API_KEY", "");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          'data: {"candidates":[{"content":{"parts":[{"text":"Build a road."}]},"finishReason":"STOP"}]}\n\n',
        ),
      ),
  );
  let middleware!: (request: unknown, response: unknown) => Promise<void>;
  const configure = localCoachPlugin().configureServer as unknown as (
    server: unknown,
  ) => void;
  configure({
    config: { mode: "test", envDir: "." },
    middlewares: {
      use(path: string, callback: typeof middleware) {
        expect(path).toBe("/api/coach");
        middleware = callback;
      },
    },
  });
  const payload = JSON.stringify({
    board: defaultBoard,
    turn: null,
    vp: 1,
    hand: emptyHand(),
    question: "What should I build?",
    buildings: "",
    opponents: "",
    stream: true,
  });
  const request = {
    method: "POST",
    headers: { "content-type": "application/json" },
    async *[Symbol.asyncIterator]() {
      yield payload;
    },
  };
  const chunks: string[] = [];
  const response = {
    statusCode: 0,
    headersSent: false,
    setHeader: vi.fn(),
    write: (chunk: string) => chunks.push(chunk),
    end: vi.fn(),
  };
  await middleware(request, response);
  expect(response.statusCode).toBe(200);
  expect(chunks.join("")).toContain('"text":"Build a road."');
  expect(chunks.join("")).toContain('"type":"done"');
});
