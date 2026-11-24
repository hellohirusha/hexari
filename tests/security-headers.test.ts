import { describe, expect, it } from "vitest";
import config from "../vercel.json";

describe("Vercel security headers", () => {
  it("applies browser protections to every route", () => {
    const rule = config.headers.find((item) => item.source === "/(.*)");
    expect(rule).toBeDefined();
    const headers = Object.fromEntries(
      rule!.headers.map(({ key, value }) => [key.toLowerCase(), value]),
    );
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["content-security-policy"]).toContain("object-src 'none'");
  });
});
