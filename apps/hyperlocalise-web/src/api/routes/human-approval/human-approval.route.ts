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
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
} from "@/api/response.schema";
import { db, schema } from "@/lib/database/client";
import { enqueueVisualWorkflowApprovalDecidedActivity } from "@/lib/activity-log/visual-workflow-events";
import { decideAuthorizedHumanApprovalRequest } from "@/lib/visual-workflows/human-approval-requests";
import { createVisualWorkflowExecutionQueue } from "@/workflows/adapters";

import {
  humanApprovalDecisionBodySchema,
  humanApprovalRequestParamsSchema,
} from "./human-approval.schema";

const validateParams = validator("param", (value, c) => {
  const parsed = humanApprovalRequestParamsSchema.safeParse(value);

  return parsed.success ? parsed.data : badRequestResponse(c, "invalid_approval_request_id");
});

const validateDecision = validator("json", (value, c) => {
  const parsed = humanApprovalDecisionBodySchema.safeParse(value);

  return parsed.success
    ? parsed.data
    : badRequestResponse(
        c,
        "invalid_approval_decision",
        "Approval decision payload is invalid.",
        parsed.error.flatten(),
      );
});

export function createHumanApprovalRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .post("/:requestId/decision", validateParams, validateDecision, async (c) => {
      const organizationId = c.var.auth.organization.localOrganizationId;
      const userId = c.var.auth.user.localUserId;
      const params = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await decideAuthorizedHumanApprovalRequest({
        requestId: params.requestId,
        organizationId,
        userId,
        decision: body.decision,
        ...(body.commentReference ? { commentReference: body.commentReference } : {}),
      });

      if (!result.ok) {
        if (result.error.code === "approval_not_found") {
          return notFoundResponse(c, result.error.code);
        }

        if (result.error.code === "approval_reviewer_forbidden") {
          return forbiddenResponse(c, result.error.code);
        }

        return conflictResponse(
          c,
          result.error.code,
          "This approval request has already been decided.",
          { status: result.error.status },
        );
      }

      /*
       * Release the paused durable lease immediately. The update is scoped to
       * the same organization and only affects an active run.
       */
      const [workflowRun] = await db
        .select({
          id: schema.visualWorkflowRuns.id,
          visualWorkflowId: schema.visualWorkflowRuns.visualWorkflowId,
        })
        .from(schema.visualWorkflowRuns)
        .where(
          and(
            eq(schema.visualWorkflowRuns.id, result.value.runId),
            eq(schema.visualWorkflowRuns.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (workflowRun) {
        await enqueueVisualWorkflowApprovalDecidedActivity({
          approvalRequestId: result.value.id,
          decision: body.decision,
          nodeId: result.value.nodeId,
          organizationId,
          runId: result.value.runId,
          userId,
          visualWorkflowId: workflowRun.visualWorkflowId,
        });

        const [resumableRun] = await db
          .update(schema.visualWorkflowRuns)
          .set({
            leaseExpiresAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.visualWorkflowRuns.id, workflowRun.id),
              eq(schema.visualWorkflowRuns.organizationId, organizationId),
              eq(schema.visualWorkflowRuns.status, "running"),
            ),
          )
          .returning({ id: schema.visualWorkflowRuns.id });

        if (resumableRun) {
          const queue = createVisualWorkflowExecutionQueue();

          await queue.enqueue({
            visualWorkflowRunId: resumableRun.id,
            visualWorkflowId: workflowRun.visualWorkflowId,
            organizationId,
          });
        }
      }

      return c.json(
        {
          approval: {
            id: result.value.id,
            runId: result.value.runId,
            nodeId: result.value.nodeId,
            reviewerId: result.value.reviewerId,
            status: result.value.status,
            commentReference: result.value.commentReference,
            decidedAt: result.value.decidedAt?.toISOString() ?? null,
          },
        },
        200,
      );
    });
}
