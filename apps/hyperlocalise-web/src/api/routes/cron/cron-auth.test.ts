import { describe, expect, it, vi } from "vite-plus/test";

describe("cron auth", () => {
  it("accepts bearer tokens that match CRON_SECRET", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      env: {
        CRON_SECRET: "cron-secret",
      },
    }));

    const { verifyCronRequest } = await import("./cron-auth");

    const request = new Request("http://localhost/api/cron/example", {
      headers: {
        authorization: "Bearer cron-secret",
      },
    });

    expect(verifyCronRequest(request)).toEqual({ ok: true });
  });

  it("rejects requests when CRON_SECRET is not configured", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      env: {
        CRON_SECRET: undefined,
      },
    }));

    const { verifyCronRequest } = await import("./cron-auth");

    const request = new Request("http://localhost/api/cron/example", {
      headers: {
        authorization: "Bearer cron-secret",
      },
    });

    expect(verifyCronRequest(request)).toEqual({ ok: false, reason: "misconfigured" });
  });
});
