/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
    10| * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { dispatchVisualWorkflowForWebhook } = vi.hoisted(() => ({
  dispatchVisualWorkflowForWebhook: vi.fn(),
}));

vi.mock("@/lib/visual-workflows/visual-workflow-dispatcher", () => ({
  dispatchVisualWorkflowForWebhook,
}));

import {
  createVisualWorkflowWebhookRoutes,
  VISUAL_WORKFLOW_WEBHOOK_TOKEN_HEADER,
} from "./visual-workflow-webhook.route";

const WORKFLOW_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "webhook-token";

const app = createVisualWorkflowWebhookRoutes();

async function postWebhook(
  path: string,
  init: {
    headers?: Record<string, string>;
    body?: string;
  } = {},
) {
  return app.request(`http://localhost${path}`, {
    method: "POST",
    headers: init.headers,
    body: init.body,
  });
}

describe("visual workflow webhook route", () => {
  beforeEach(() => {
    dispatchVisualWorkflowForWebhook.mockReset();
  });

  it("rejects a request with no token", async () => {
    const response = await postWebhook(`/${WORKFLOW_ID}`, {
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "missing_webhook_token" });
    expect(dispatchVisualWorkflowForWebhook).not.toHaveBeenCalled();
  });

  it("treats a non-uuid workflow id as not found", async () => {
    const response = await postWebhook("/not-a-workflow", {
      headers: {
        "content-type": "application/json",
        [VISUAL_WORKFLOW_WEBHOOK_TOKEN_HEADER]: TOKEN,
      },
      body: "{}",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "visual_workflow_not_found" });
    expect(dispatchVisualWorkflowForWebhook).not.toHaveBeenCalled();
  });

  it("prefers the header token when a query token is also present", async () => {
    dispatchVisualWorkflowForWebhook.mockResolvedValueOnce({
      outcome: "enqueued",
      runId: "run_1",
      inserted: true,
    });

    const response = await postWebhook(`/${WORKFLOW_ID}?token=query-token&ref=issue-12`, {
      headers: {
        "content-type": "application/json",
        [VISUAL_WORKFLOW_WEBHOOK_TOKEN_HEADER]: TOKEN,
        "idempotency-key": "delivery-1",
      },
      body: JSON.stringify({ event: "issue.opened" }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      runId: "run_1",
      deliveryId: "delivery-1",
      duplicate: false,
    });
    expect(dispatchVisualWorkflowForWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        visualWorkflowId: WORKFLOW_ID,
        token: TOKEN,
        deliveryId: "delivery-1",
        body: { event: "issue.opened" },
        query: { ref: "issue-12" },
      }),
    );
  });

  it("reads an empty body as null and a form body as fields", async () => {
    dispatchVisualWorkflowForWebhook
      .mockResolvedValueOnce({ outcome: "enqueued", runId: "run_empty", inserted: true })
      .mockResolvedValueOnce({ outcome: "enqueued", runId: "run_form", inserted: true });

    const empty = await postWebhook(`/${WORKFLOW_ID}?token=${TOKEN}`);
    expect(empty.status).toBe(202);
    expect(dispatchVisualWorkflowForWebhook).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ body: null }),
    );

    const form = await postWebhook(`/${WORKFLOW_ID}?token=${TOKEN}`, {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "status=ok&count=2",
    });
    expect(form.status).toBe(202);
    expect(dispatchVisualWorkflowForWebhook).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ body: { status: "ok", count: "2" } }),
    );
  });

  it("rejects invalid JSON only when the content type claims JSON", async () => {
    const invalidJson = await postWebhook(`/${WORKFLOW_ID}?token=${TOKEN}`, {
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    expect(invalidJson.status).toBe(400);
    await expect(invalidJson.json()).resolves.toMatchObject({ error: "invalid_webhook_body" });
    expect(dispatchVisualWorkflowForWebhook).not.toHaveBeenCalled();

    dispatchVisualWorkflowForWebhook.mockResolvedValueOnce({
      outcome: "enqueued",
      runId: "run_text",
      inserted: true,
    });
    const rawText = await postWebhook(`/${WORKFLOW_ID}?token=${TOKEN}`, {
      body: "{not-json",
    });
    expect(rawText.status).toBe(202);
    expect(dispatchVisualWorkflowForWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ body: "{not-json" }),
    );
  });

  it("maps dispatcher outcomes to HTTP status codes", async () => {
    dispatchVisualWorkflowForWebhook
      .mockResolvedValueOnce({ outcome: "not_found" })
      .mockResolvedValueOnce({ outcome: "unauthorized" })
      .mockResolvedValueOnce({ outcome: "feature_unavailable" })
      .mockResolvedValueOnce({ outcome: "skipped", skipReason: "inactive" })
      .mockResolvedValueOnce({ outcome: "enqueued", runId: "run_dup", inserted: false });

    const notFound = await postWebhook(`/${WORKFLOW_ID}?token=${TOKEN}`);
    expect(notFound.status).toBe(404);
    await expect(notFound.json()).resolves.toMatchObject({ error: "visual_workflow_not_found" });

    const unauthorized = await postWebhook(`/${WORKFLOW_ID}?token=${TOKEN}`);
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toMatchObject({ error: "invalid_webhook_token" });

    const forbidden = await postWebhook(`/${WORKFLOW_ID}?token=${TOKEN}`);
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({ error: "feature_unavailable" });

    const skipped = await postWebhook(`/${WORKFLOW_ID}?token=${TOKEN}`);
    expect(skipped.status).toBe(202);
    await expect(skipped.json()).resolves.toEqual({
      ok: true,
      ignored: true,
      reason: "inactive",
    });

    const duplicate = await postWebhook(`/${WORKFLOW_ID}?token=${TOKEN}`, {
      headers: { "idempotency-key": "same-delivery" },
    });
    expect(duplicate.status).toBe(202);
    await expect(duplicate.json()).resolves.toEqual({
      ok: true,
      runId: "run_dup",
      deliveryId: "same-delivery",
      duplicate: true,
    });
  });

  it("truncates the idempotency key before dispatch", async () => {
    dispatchVisualWorkflowForWebhook.mockResolvedValueOnce({
      outcome: "enqueued",
      runId: "run_long",
      inserted: true,
    });
    const longKey = "k".repeat(240);

    await postWebhook(`/${WORKFLOW_ID}?token=${TOKEN}`, {
      headers: { "idempotency-key": longKey },
    });

    expect(dispatchVisualWorkflowForWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryId: "k".repeat(200) }),
    );
  });

  it("rejects a body larger than 256 KiB", async () => {
    const response = await postWebhook(`/${WORKFLOW_ID}?token=${TOKEN}`, {
      headers: { "content-type": "text/plain" },
      body: "x".repeat(256 * 1024 + 1),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "payload_too_large" });
    expect(dispatchVisualWorkflowForWebhook).not.toHaveBeenCalled();
  });
});
