import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCoach } from "../src/shared/coachClient";

afterEach(() => vi.unstubAllGlobals());

describe("coach stream client", () => {
  it("shows fragments as they arrive and returns completed advice", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"type":"delta","text":"Build "}\n\n'),
        );
        controller.enqueue(
          encoder.encode(
            'data: {"type":"delta","text":"a road."}\n\ndata: {"type":"done"}\n\n',
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, {
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    );
    const updates: string[] = [];
    await expect(requestCoach({}, (text) => updates.push(text))).resolves.toBe(
      "Build a road.",
    );
    expect(updates).toEqual(["Build ", "Build a road."]);
  });
  it("rejects incomplete streams", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('data: {"type":"delta","text":"Partial"}\n\n', {
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    );
    await expect(requestCoach({}, () => {})).rejects.toThrow("interrupted");
  });
  it("surfaces configuration errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "Not configured" }, { status: 503 }),
        ),
    );
    await expect(requestCoach({}, () => {})).rejects.toThrow("Not configured");
  });
});
