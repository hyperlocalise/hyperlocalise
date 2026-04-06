import "dotenv/config";

import { createHmac } from "node:crypto";

import { Hono } from "hono";
import { testClient } from "hono/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const secret = "test-workos-webhook-secret";

function sign(body: string) {
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

  return `t=${timestamp},v1=${digest}`;
}

describe("workosWebhookRoutes", () => {
  beforeEach(() => {
    process.env.WORKOS_WEBHOOK_SECRET = secret;
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock("@/api/auth/workos-sync");
    vi.doUnmock("@/lib/database");
  });

  it("returns 401 for invalid signature", async () => {
    const { workosWebhookRoutes } = await import("./workos-webhook");
    const app = new Hono().basePath("/api").route("/webhooks/workos", workosWebhookRoutes);
    const client = testClient(app);

    const response = await client.api.webhooks.workos.$post(
      {
        json: {
          event: "user.created",
          data: {
            id: "user_123",
            email: "dev@example.com",
          },
        },
      },
      {
        headers: {
          "workos-signature": "t=1,v1=bad",
        },
      },
    );

    expect(response.status).toBe(401);
  });

  it("handles user.created event", async () => {
    const syncWorkosUser = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@/api/auth/workos-sync", async () => {
      const actual = await vi.importActual<typeof import("@/api/auth/workos-sync")>(
        "@/api/auth/workos-sync",
      );

      return {
        ...actual,
        syncWorkosUser,
      };
    });

    vi.doMock("@/lib/database", () => ({
      db: {},
    }));

    const { workosWebhookRoutes } = await import("./workos-webhook");
    const app = new Hono().basePath("/api").route("/webhooks/workos", workosWebhookRoutes);
    const client = testClient(app);

    const payload = JSON.stringify({
      event: "user.created",
      data: {
        id: "user_123",
        email: "dev@example.com",
        first_name: "Dev",
      },
    });

    const response = await client.api.webhooks.workos.$post(
      {
        json: JSON.parse(payload) as unknown as never,
      },
      {
        headers: {
          "workos-signature": sign(payload),
        },
      },
    );

    expect(response.status).toBe(200);
    expect(syncWorkosUser).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        workosUserId: "user_123",
        email: "dev@example.com",
      }),
    );
  });
});
