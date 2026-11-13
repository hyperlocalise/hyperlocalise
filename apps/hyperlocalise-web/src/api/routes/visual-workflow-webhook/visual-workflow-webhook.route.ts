/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { validator } from "hono/validator";
import { z } from "zod";

import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "@/api/response.schema";
import { createLogger } from "@/lib/log";
import { dispatchVisualWorkflowForWebhook } from "@/lib/visual-workflows/visual-workflow-dispatcher";
import type { VisualWorkflowExecutionQueue } from "@/lib/workflow/types";

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;
const MAX_DELIVERY_ID_LENGTH = 200;
export const VISUAL_WORKFLOW_WEBHOOK_TOKEN_HEADER = "x-hyperlocalise-webhook-token";

const logger = createLogger("visual-workflow-webhook");

const validateParams = validator("param", (value, c) => {
  const parsed = z.object({ visualWorkflowId: z.uuid() }).safeParse(value);
  return parsed.success ? parsed.data : notFoundResponse(c, "visual_workflow_not_found");
});

/** Reads the body as JSON, as form fields, or as text, so any sender's payload reaches the run. */
async function readWebhookBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  const contentType = request.headers.get("content-type") ?? "";
  const text = await request.text();
  if (!text) {
    return { ok: true, body: null };
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return { ok: true, body: Object.fromEntries(new URLSearchParams(text)) };
  }
  if (contentType.includes("json") || !contentType) {
    try {
      return { ok: true, body: JSON.parse(text) };
    } catch {
      return contentType ? { ok: false } : { ok: true, body: text };
    }
  }
  return { ok: true, body: text };
}

export function createVisualWorkflowWebhookRoutes(
  options: { queue?: VisualWorkflowExecutionQueue } = {},
) {
  return new Hono().post(
    "/:visualWorkflowId",
    validateParams,
    bodyLimit({
      maxSize: MAX_WEBHOOK_BODY_BYTES,
      onError: (c) => c.json({ error: "payload_too_large" }, 413),
    }),
    async (c) => {
      const { visualWorkflowId } = c.req.valid("param");
      const { token: queryToken, ...query } = c.req.query();
      const token = c.req.header(VISUAL_WORKFLOW_WEBHOOK_TOKEN_HEADER) ?? queryToken;
      if (!token) {
        return unauthorizedResponse(c, "missing_webhook_token");
      }

      const parsed = await readWebhookBody(c.req.raw);
      if (!parsed.ok) {
        return badRequestResponse(c, "invalid_webhook_body", "Request body is not valid JSON.");
      }

      const deliveryId =
        c.req.header("idempotency-key")?.slice(0, MAX_DELIVERY_ID_LENGTH) || crypto.randomUUID();
      const result = await dispatchVisualWorkflowForWebhook({
        visualWorkflowId,
        token,
        deliveryId,
        body: parsed.body,
        query,
        queue: options.queue,
      });

      if (result.outcome === "not_found") {
        return notFoundResponse(c, "visual_workflow_not_found");
      }
      if (result.outcome === "unauthorized") {
        return unauthorizedResponse(c, "invalid_webhook_token");
      }
      if (result.outcome === "feature_unavailable") {
        return forbiddenResponse(
          c,
          "feature_unavailable",
          "Automation Workflow is not included in your current plan.",
        );
      }
      if (result.outcome === "skipped") {
        logger.info(
          { visualWorkflowId, deliveryId, skipReason: result.skipReason },
          "visual workflow webhook skipped",
        );
        return c.json({ ok: true, ignored: true, reason: result.skipReason }, 202);
      }
      return c.json(
        { ok: true, runId: result.runId, deliveryId, duplicate: !result.inserted },
        202,
      );
    },
  );
}
