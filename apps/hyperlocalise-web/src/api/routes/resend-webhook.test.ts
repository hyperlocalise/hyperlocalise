import "dotenv/config";

import { describe, expect, it, vi } from "vite-plus/test";

import { createResendWebhookRoutes } from "./resend-webhook";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  resendWebhook: vi.fn().mockResolvedValue(Response.json({ status: "ok" })),
}));

vi.mock("next/server", () => ({
  after: mocks.after,
}));

vi.mock("@/lib/agents/email/bot", () => {
  return {
    getEmailBot: vi.fn().mockResolvedValue({
      webhooks: {
        resend: mocks.resendWebhook,
      },
    }),
  };
});

vi.mock("@/workflows/adapters", () => ({
  createEmailAgentTaskQueue: vi.fn(() => ({
    enqueue: vi.fn(async () => ({ ids: ["run_123"] })),
  })),
}));

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
    expect(mocks.resendWebhook).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        waitUntil: expect.any(Function),
      }),
    );
  });

  it("registers Resend message processing with Next after", async () => {
    const app = createResendWebhookRoutes();
    const task = Promise.resolve();

    await app.request("http://localhost/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "email.received", data: {} }),
    });

    const options = mocks.resendWebhook.mock.calls.at(-1)?.[1];
    options.waitUntil(task);

    expect(mocks.after).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.after.mock.calls.at(-1)?.[0]()).toBe(task);
  });
});
