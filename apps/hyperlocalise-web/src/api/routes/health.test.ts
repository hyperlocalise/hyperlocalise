import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

async function createClient(isHealthy: boolean) {
  vi.resetModules();

  vi.doMock("@/lib/database", () => ({
    isDatabaseHealthy: vi.fn().mockResolvedValue(isHealthy),
  }));

  const { healthRoutes } = await import("./health");

  return testClient(healthRoutes);
}

describe("healthRoutes", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/database");
  });

  it("returns 200 when database is healthy", async () => {
    const client = await createClient(true);
    const response = await client.index.$get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("returns 503 when database is unavailable", async () => {
    const client = await createClient(false);
    const response = await client.index.$get();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "database_unavailable",
    });
  });
});
