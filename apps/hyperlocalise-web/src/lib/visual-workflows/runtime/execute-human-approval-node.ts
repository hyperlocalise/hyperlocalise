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
import type { CanonicalVisualWorkflowNode } from "../schema/types";
import { enqueueVisualWorkflowApprovalRequestedActivity } from "@/lib/activity-log/visual-workflow-events";
import {
  createHumanApprovalRequest,
  getHumanApprovalRequestByNodeRun,
  timeoutHumanApprovalRequest,
} from "../human-approval-requests";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";

export async function executeHumanApprovalNode(input: {
  node: CanonicalVisualWorkflowNode;
  organizationId: string;
  runId: string;
  nodeRunId: string;
  visualWorkflowId: string;
  now?: Date;
}): Promise<VisualWorkflowNodeExecutionResult> {
  if (input.node.config.kind !== "flow.human_approval") {
    return {
      ok: false,
      error: {
        code: "invalid_human_approval_node",
        message: "Invalid Human Approval node.",
      },
    };
  }

  const now = input.now ?? new Date();
  const config = input.node.config;
  const deadline = config.deadline ? new Date(config.deadline) : null;

  if (!deadline || !Number.isFinite(deadline.getTime())) {
    return {
      ok: false,
      error: {
        code: "invalid_approval_deadline",
        message: "Human Approval requires a valid deadline.",
      },
    };
  }

  let request = await getHumanApprovalRequestByNodeRun({
    organizationId: input.organizationId,
    nodeRunId: input.nodeRunId,
  });

  if (!request) {
    const created = await createHumanApprovalRequest({
      organizationId: input.organizationId,
      runId: input.runId,
      nodeRunId: input.nodeRunId,
      nodeId: input.node.id,
      reviewerType: config.reviewerType,
      reviewerId: config.reviewerId,
      prompt: config.prompt,
      ...(config.artifactReference ? { artifactReference: config.artifactReference } : {}),
      ...(config.jobReference ? { jobReference: config.jobReference } : {}),
      expiresAt: deadline,
    });

    if (!created.ok) {
      return {
        ok: false,
        error: {
          code: created.error.code,
          message: "The Human Approval request could not be created.",
        },
      };
    }

    request = created.value;

    await enqueueVisualWorkflowApprovalRequestedActivity({
      approvalRequestId: request.id,
      nodeId: input.node.id,
      organizationId: input.organizationId,
      reviewerId: config.reviewerId,
      reviewerType: config.reviewerType,
      runId: input.runId,
      visualWorkflowId: input.visualWorkflowId,
    });
  }

  if (request.status === "pending" && request.expiresAt <= now) {
    const timedOut = await timeoutHumanApprovalRequest({
      organizationId: input.organizationId,
      requestId: request.id,
      now,
    });

    request =
      timedOut ??
      (await getHumanApprovalRequestByNodeRun({
        organizationId: input.organizationId,
        nodeRunId: input.nodeRunId,
      }));

    if (!request) {
      return {
        ok: false,
        error: {
          code: "approval_not_found",
          message: "The Human Approval request could not be recovered.",
        },
      };
    }
  }

  if (request.status === "pending") {
    return {
      ok: false,
      error: {
        code: "yield_execution",
        message: "The workflow is waiting for a human approval decision.",
        approvalRequestId: request.id,
        wakeAt: request.expiresAt.toISOString(),
      },
    };
  }

  if (request.status === "cancelled") {
    return {
      ok: false,
      error: {
        code: "cancelled",
        message: "The Human Approval request was cancelled.",
      },
    };
  }

  if (
    request.status !== "approved" &&
    request.status !== "rejected" &&
    request.status !== "changes_requested" &&
    request.status !== "timed_out"
  ) {
    return {
      ok: false,
      error: {
        code: "invalid_approval_status",
        message: "The Human Approval request has an unsupported status.",
      },
    };
  }

  if (!request.decidedAt) {
    return {
      ok: false,
      error: {
        code: "invalid_approval_decision",
        message: "The Human Approval decision is missing its decision time.",
      },
    };
  }

  return {
    ok: true,
    switchCase: request.status,
    output: {
      reviewerId: request.reviewerId,
      decision: request.status,
      ...(request.commentReference ? { commentReference: request.commentReference } : {}),
      decidedAt: request.decidedAt.toISOString(),
    },
  };
}
