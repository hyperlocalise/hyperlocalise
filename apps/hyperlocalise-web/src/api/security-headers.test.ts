import { describe, expect, it } from "vitest";
import { app } from "@/api/app";

describe("security headers", () => {
  it("should have security headers on the health endpoint", async () => {
    const res = await app.request("/api/health");

    // Default Hono secureHeaders() includes these:
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("X-XSS-Protection")).toBe("0");
  });

  it("should have security headers on other endpoints", async () => {
    // Auth route
    const res = await app.request("/api/auth/context");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
