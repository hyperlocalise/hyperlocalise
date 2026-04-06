import "dotenv/config";

import { createHmac } from "node:crypto";

import { testClient } from "hono/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";

const secret = "test-workos-webhook-secret";

function sign(body: string, timestamp?: number) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

  return `t=${ts},v1=${digest}`;
}

vi.mock("@/api/auth/workos-sync", () => ({
  syncWorkosUser: vi.fn().mockResolvedValue(undefined),
  syncWorkosOrganization: vi.fn().mockResolvedValue(undefined),
  syncWorkosIdentity: vi.fn().mockResolvedValue(undefined),
  removeWorkosMembership: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/database", () => ({
  db: {},
}));

describe("workosWebhookRoutes", () => {
  beforeEach(() => {
    process.env.WORKOS_WEBHOOK_SECRET = secret;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/api/auth/workos-sync");
    vi.doUnmock("@/lib/database");
  });

  it("returns 401 for invalid signature", async () => {
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
  });
});
