import "dotenv/config";

import { describe, expect, it } from "vite-plus/test";

import { createGithubWebhookRoutes } from "./github-webhook";

describe("githubWebhookRoutes", () => {
  it("delegates GitHub webhooks to the Chat SDK bot handler", async () => {
    let called = false;
    const app = createGithubWebhookRoutes({
      githubWebhookHandler: async (request) => {
        called = true;
        expect(request.method).toBe("POST");
        return Response.json({ ok: true });
      },
    });

    const response = await app.request("http://localhost/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "issue_comment",
      },
      body: JSON.stringify({ action: "created" }),
    });

    expect(response.status).toBe(200);
    expect(called).toBe(true);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
