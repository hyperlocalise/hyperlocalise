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
import { z } from "zod";

import {
  conflictResponse,
  notFoundResponse,
  serviceUnavailableResponse,
  unauthorizedResponse,
} from "@/api/response.schema";
import { verifyGoSvcServiceToken } from "@/lib/go-svc/go-svc-service-token";
import {
  failDeepAudit,
  findDeepAuditRunWithDomain,
  setDeepAuditWorkflowRunId,
} from "@/lib/localisation-audit/deep/store";
import { createLogger } from "@/lib/log";
import type { LocalisationDeepAuditQueue } from "@/lib/workflow/types";
import { createLocalisationDeepAuditQueue } from "@/workflows/adapters";

const logger = createLogger("internal-deep-audits");

const runIdSchema = z.string().uuid();

export function createInternalDeepAuditRoutes(
  options: { queue?: LocalisationDeepAuditQueue } = {},
) {
  const queue = options.queue ?? createLocalisationDeepAuditQueue();

  return new Hono()
    .use("*", async (c, next) => {
      const auth = verifyGoSvcServiceToken(c.req.raw);
      if (!auth.ok) {
        if (auth.reason === "misconfigured") {
          logger.warn(
            { reason: "misconfigured" },
            "deep audit start rejected; service token is not configured",
          );
          return serviceUnavailableResponse(c, "deep_audit_misconfigured");
        }
        return unauthorizedResponse(c, "unauthorized", "missing server call token");
      }
      await next();
    })
    .post("/:runId/start", async (c) => {
      const parsedRunId = runIdSchema.safeParse(c.req.param("runId"));
      if (!parsedRunId.success) {
        return notFoundResponse(c, "deep_audit_not_found");
      }
      const runId = parsedRunId.data;

      const found = await findDeepAuditRunWithDomain(runId);
      if (!found) {
        return notFoundResponse(c, "deep_audit_not_found");
      }
      if (found.run.workflowRunId) {
        return c.json({ runId, workflowRunId: found.run.workflowRunId, alreadyStarted: true });
      }
      if (found.run.status !== "queued") {
        return conflictResponse(c, "deep_audit_not_queued", "This deep audit is no longer queued.");
      }

      try {
        const { ids } = await queue.enqueue({ runId });
        const workflowRunId = ids[0];
        if (workflowRunId) {
          await setDeepAuditWorkflowRunId(runId, workflowRunId);
        }
        return c.json({ runId, workflowRunId: workflowRunId ?? null, alreadyStarted: false }, 202);
      } catch (error) {
        logger.error({ err: error, runId }, "failed to start deep audit workflow");
        await failDeepAudit({
          runId,
          errorCode: "deep_audit_start_failed",
          errorMessage: "The deep audit could not be started. Try again.",
        });
        return serviceUnavailableResponse(c, "deep_audit_start_failed");
      }
    });
}
