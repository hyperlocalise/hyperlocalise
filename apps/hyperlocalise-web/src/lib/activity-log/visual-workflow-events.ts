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
import "server-only";

import type { ActivityActorKind } from "./activity-log-contract";
import { enqueueActivityLogEvent } from "./activity-log-writer";

type ActivityActor = {
  actorCredentialId: string | null;
  actorKind: ActivityActorKind;
  actorUserId: string | null;
};

function activityActor(input: ActivityActor) {
  return {
    actorCredentialId: input.actorCredentialId,
    actorKind: input.actorKind,
    actorUserId: input.actorUserId,
  };
}

type VisualWorkflowActivityInput = ActivityActor & {
  name: string;
  organizationId: string;
  visualWorkflowId: string;
};

export async function enqueueVisualWorkflowCreatedActivity(input: VisualWorkflowActivityInput) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "visual_workflow_created",
    organizationId: input.organizationId,
    payload: {
      name: input.name,
      status: "draft",
      visualWorkflowId: input.visualWorkflowId,
    },
    targetId: input.visualWorkflowId,
    targetKind: "visual_workflow",
  });
}

export async function enqueueVisualWorkflowDeletedActivity(input: VisualWorkflowActivityInput) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "visual_workflow_deleted",
    organizationId: input.organizationId,
    payload: {
      name: input.name,
      status: "archived",
      visualWorkflowId: input.visualWorkflowId,
    },
    targetId: input.visualWorkflowId,
    targetKind: "visual_workflow",
  });
}

export async function enqueueVisualWorkflowPublishedActivity(
  input: VisualWorkflowActivityInput & { publishedVersion: number },
) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "visual_workflow_published",
    organizationId: input.organizationId,
    payload: {
      name: input.name,
      publishedVersion: input.publishedVersion,
      visualWorkflowId: input.visualWorkflowId,
    },
    targetId: input.visualWorkflowId,
    targetKind: "visual_workflow",
  });
}

export async function enqueueVisualWorkflowStatusActivity(
  input: VisualWorkflowActivityInput & { status: "active" | "archived" | "paused" },
) {
  if (input.status === "active") {
    return enqueueActivityLogEvent({
      ...activityActor(input),
      eventType: "visual_workflow_enabled",
      organizationId: input.organizationId,
      payload: {
        name: input.name,
        status: input.status,
        visualWorkflowId: input.visualWorkflowId,
      },
      targetId: input.visualWorkflowId,
      targetKind: "visual_workflow",
    });
  }

  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "visual_workflow_disabled",
    organizationId: input.organizationId,
    payload: {
      name: input.name,
      status: input.status,
      visualWorkflowId: input.visualWorkflowId,
    },
    targetId: input.visualWorkflowId,
    targetKind: "visual_workflow",
  });
}

export async function enqueueVisualWorkflowRunStartedActivity(
  input: VisualWorkflowActivityInput & { runId: string; triggerSource: string },
) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "visual_workflow_run_started",
    organizationId: input.organizationId,
    payload: {
      name: input.name,
      runId: input.runId,
      status: "queued",
      triggerSource: input.triggerSource,
      visualWorkflowId: input.visualWorkflowId,
    },
    targetId: input.visualWorkflowId,
    targetKind: "visual_workflow",
  });
}

export async function enqueueVisualWorkflowApprovalRequestedActivity(input: {
  approvalRequestId: string;
  nodeId: string;
  organizationId: string;
  reviewerId: string;
  reviewerType: "user" | "team";
  runId: string;
  visualWorkflowId: string;
}) {
  return enqueueActivityLogEvent({
    actorCredentialId: null,
    actorKind: "system",
    actorUserId: null,
    eventType: "visual_workflow_approval_requested",
    organizationId: input.organizationId,
    payload: {
      approvalRequestId: input.approvalRequestId,
      nodeId: input.nodeId,
      reviewerId: input.reviewerId,
      reviewerType: input.reviewerType,
      runId: input.runId,
      status: "pending",
      visualWorkflowId: input.visualWorkflowId,
    },
    targetId: input.visualWorkflowId,
    targetKind: "visual_workflow",
  });
}

export async function enqueueVisualWorkflowApprovalDecidedActivity(input: {
  approvalRequestId: string;
  decision: "approved" | "rejected" | "changes_requested";
  nodeId: string;
  organizationId: string;
  runId: string;
  userId: string;
  visualWorkflowId: string;
}) {
  return enqueueActivityLogEvent({
    actorCredentialId: null,
    actorKind: "user",
    actorUserId: input.userId,
    eventType: "visual_workflow_approval_decided",
    organizationId: input.organizationId,
    payload: {
      approvalRequestId: input.approvalRequestId,
      decision: input.decision,
      nodeId: input.nodeId,
      runId: input.runId,
      visualWorkflowId: input.visualWorkflowId,
    },
    targetId: input.visualWorkflowId,
    targetKind: "visual_workflow",
  });
}
