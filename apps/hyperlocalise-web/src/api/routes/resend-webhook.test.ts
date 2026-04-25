import "dotenv/config";

import { describe, expect, it, vi } from "vite-plus/test";

import { createResendWebhookRoutes } from "./resend-webhook";

vi.mock("@/lib/agents/email/bot", () => {
  return {
    getEmailBot: vi.fn().mockResolvedValue({
      webhooks: {
        resend: vi.fn().mockResolvedValue(Response.json({ status: "ok" })),
      },
    }),
  };
});

describe("resendWebhookRoutes", () => {
  it("delegates Resend webhooks to the email bot adapter", async () => {
    const app = createResendWebhookRoutes();

    const response = await app.request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": "msg_123",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,test",
      },
      body: JSON.stringify({
        type: "email.received",
        data: {
          email_id: "email_123",
          from: "user@example.com",
          to: ["bot@example.com"],
          subject: "Translate my file",
          text: "from en to fr",
          message_id: "msg_123",
          attachments: [],
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
