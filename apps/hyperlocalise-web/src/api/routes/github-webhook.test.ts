import "dotenv/config";

import { createHmac } from "node:crypto";

import { describe, expect, it } from "vite-plus/test";

import { app } from "@/api/app";

const secret = "test-github-app-webhook-secret";

function sign(body: string) {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

describe("githubWebhookRoutes", () => {
  it("returns 401 for invalid signatures", async () => {
    const response = await app.request("http://localhost/api/webhooks/github", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=bad",
      },
      body: JSON.stringify({
        action: "created",
      }),
    });

    expect(response.status).toBe(401);
  });

  it("accepts verified json payloads", async () => {
    const payload = JSON.stringify({
      action: "created",
      installation: {
        id: 123,
      },
    });

    const response = await app.request("http://localhost/api/webhooks/github", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-123",
        "x-github-event": "installation",
        "x-hub-signature-256": sign(payload),
      },
      body: payload,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deliveryId: "delivery-123",
      event: "installation",
    });
  });

  it("accepts verified form-encoded payloads", async () => {
    const encodedPayload = JSON.stringify({
      action: "pending_change",
      marketplace_purchase: {
        plan: {
          id: 456,
        },
      },
    });
    const body = new URLSearchParams({ payload: encodedPayload }).toString();

    const response = await app.request("http://localhost/api/webhooks/github", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-github-event": "marketplace_purchase",
        "x-hub-signature-256": sign(body),
      },
      body,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deliveryId: null,
      event: "marketplace_purchase",
    });
  });

  it("returns 400 for malformed form-encoded payloads", async () => {
    const body = new URLSearchParams({ not_payload: "value" }).toString();

    const response = await app.request("http://localhost/api/webhooks/github", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-hub-signature-256": sign(body),
      },
      body,
    });

    expect(response.status).toBe(400);
  });
});
