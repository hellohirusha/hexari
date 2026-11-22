import { loadEnv, type Plugin } from "vite";
import handler from "../../api/coach";

type LocalRequest = AsyncIterable<{ toString(): string }> & {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};
type LocalResponse = {
  statusCode: number;
  headersSent: boolean;
  setHeader(name: string, value: string): void;
  end(value?: string): void;
  write(chunk: string): unknown;
};

// Vite serves only the frontend by default. Mount the same handler used by
// Vercel during development without exposing provider keys to the browser.
export function localCoachPlugin(): Plugin {
  return {
    name: "local-coach",
    apply: "serve",
    configureServer(server) {
      const values = loadEnv(server.config.mode, server.config.envDir, "");
      const env = (
        globalThis as unknown as {
          process: { env: Record<string, string | undefined> };
        }
      ).process.env;
      for (const name of [
        "GEMINI_API_KEY",
        "GEMINI_MODEL",
        "GROQ_API_KEY",
        "GROQ_MODEL",
        "COACH_MAX_REQUESTS_PER_MINUTE",
        "COACH_MAX_REQUESTS_PER_HOUR",
      ]) {
        if (env[name] === undefined && values[name]) env[name] = values[name];
      }
      server.middlewares.use("/api/coach", async (request, response) => {
        const req = request as unknown as LocalRequest;
        const res = response as unknown as LocalResponse;
        const reply = Object.assign(res, {
          status(code: number) {
            res.statusCode = code;
            return reply;
          },
          json(value: unknown) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify(value));
          },
        });
        try {
          let body = "";
          for await (const chunk of req) {
            body += chunk.toString();
            if (body.length > 16384) {
              reply.status(413).json({ error: "Request body is too large." });
              return;
            }
          }
          let parsed: unknown;
          if (body) {
            try {
              parsed = JSON.parse(body);
            } catch {
              reply.status(400).json({ error: "Invalid JSON." });
              return;
            }
          }
          await handler(
            {
              method: req.method,
              headers: req.headers,
              socket: req.socket,
              body: parsed,
            },
            reply,
          );
        } catch {
          if (!res.headersSent)
            reply.status(500).json({ error: "The coach is unavailable." });
          else res.end();
        }
      });
    },
  };
}
