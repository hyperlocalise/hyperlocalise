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
import { createLogger } from "@/lib/log";
import type { VisualWorkflowExecutionQueue } from "@/lib/workflow/types";
import { createVisualWorkflowExecutionQueue } from "@/workflows/adapters";

import {
  buildVisualWorkflowGithubIdempotencyKey,
  buildVisualWorkflowScheduledIdempotencyKey,
  buildVisualWorkflowSourceUploadIdempotencyKey,
} from "./dispatch/idempotency";
import {
  visualWorkflowShouldDispatchOnGithubPullRequest,
  visualWorkflowShouldDispatchOnGithubPush,
  visualWorkflowShouldDispatchOnSourceUpload,
} from "./dispatch/trigger-matching";
import {
  advanceVisualWorkflowNextRun,
  listDueScheduledVisualWorkflows,
  listVisualWorkflows,
} from "./visual-workflows";
import {
  createVisualWorkflowRun,
  enqueueVisualWorkflowRunOnce,
  getVisualWorkflowRunByIdempotencyKey,
} from "./visual-workflow-runs";
import type { VisualWorkflowRecord } from "./visual-workflow-types";
import type {
  VisualWorkflowRunRecord,
  VisualWorkflowRunTriggerSource,
} from "./visual-workflow-run-types";

const logger = createLogger("visual-workflow-dispatch");

const ACTIVE_WORKFLOW_PAGE_SIZE = 100;

async function listAllActiveVisualWorkflows(
  organizationId: string,
): Promise<VisualWorkflowRecord[]> {
  const workflows: VisualWorkflowRecord[] = [];
  let offset = 0;

  while (true) {
    const page = await listVisualWorkflows({
      organizationId,
      status: "active",
      limit: ACTIVE_WORKFLOW_PAGE_SIZE,
      offset,
    });
    workflows.push(...page);

    if (page.length < ACTIVE_WORKFLOW_PAGE_SIZE) {
      break;
    }

    offset += ACTIVE_WORKFLOW_PAGE_SIZE;
  }

  return workflows;
}

export type VisualWorkflowDispatchResult =
  | {
      outcome: "enqueued";
      runId: string;
      inserted: boolean;
      enqueued: boolean;
      scheduleSlotCommitted: boolean;
    }
  | {
      outcome: "skipped";
      runId: string;
      inserted: boolean;
      enqueued: boolean;
      scheduleSlotCommitted: boolean;
      skipReason: string;
    };

function executionQueue(input?: VisualWorkflowExecutionQueue) {
  return input ?? createVisualWorkflowExecutionQueue();
}

function visualWorkflowRunWasEnqueued(run: VisualWorkflowRunRecord): boolean {
  const marker = run.outputSummary.executionEnqueuedAt;
  return typeof marker === "string" && marker.length > 0;
}

async function dispatchVisualWorkflowRun(input: {
  workflow: VisualWorkflowRecord;
  triggerSource: VisualWorkflowRunTriggerSource;
  idempotencyKey: string;
  inputSnapshot?: Record<string, unknown>;
  queue?: VisualWorkflowExecutionQueue;
}): Promise<VisualWorkflowDispatchResult> {
  if (input.workflow.status !== "active") {
    return {
      outcome: "skipped",
      runId: "",
      inserted: false,
      enqueued: false,
      scheduleSlotCommitted: false,
      skipReason: "workflow_not_active",
    };
  }

  const existing = await getVisualWorkflowRunByIdempotencyKey({
    organizationId: input.workflow.organizationId,
    visualWorkflowId: input.workflow.id,
    idempotencyKey: input.idempotencyKey,
  });
  const queue = executionQueue(input.queue);

  if (existing) {
    const scheduleSlotCommitted = visualWorkflowRunWasEnqueued(existing);
    const enqueued = await enqueueVisualWorkflowRunOnce({
      runId: existing.id,
      organizationId: input.workflow.organizationId,
      enqueue: async () => {
        await queue.enqueue({
          visualWorkflowRunId: existing.id,
          visualWorkflowId: input.workflow.id,
          organizationId: input.workflow.organizationId,
        });
      },
    });

    return {
      outcome: "enqueued",
      runId: existing.id,
      inserted: false,
      enqueued,
      scheduleSlotCommitted: scheduleSlotCommitted || enqueued,
    };
  }

  const run = await createVisualWorkflowRun({
    organizationId: input.workflow.organizationId,
    visualWorkflowId: input.workflow.id,
    triggerSource: input.triggerSource,
    idempotencyKey: input.idempotencyKey,
    inputSnapshot: input.inputSnapshot,
  });

  const enqueued = await enqueueVisualWorkflowRunOnce({
    runId: run.id,
    organizationId: input.workflow.organizationId,
    enqueue: async () => {
      await queue.enqueue({
        visualWorkflowRunId: run.id,
        visualWorkflowId: input.workflow.id,
        organizationId: input.workflow.organizationId,
      });
    },
  });

  return {
    outcome: "enqueued",
    runId: run.id,
    inserted: true,
    enqueued,
    scheduleSlotCommitted: enqueued,
  };
}

export async function dispatchVisualWorkflowForScheduleAndAdvance(input: {
  workflow: VisualWorkflowRecord;
  scheduledRunAt: Date;
  completedAt?: Date;
  queue?: VisualWorkflowExecutionQueue;
}) {
  const result = await dispatchVisualWorkflowRun({
    workflow: input.workflow,
    triggerSource: "scheduled",
    idempotencyKey: buildVisualWorkflowScheduledIdempotencyKey({
      visualWorkflowId: input.workflow.id,
      definitionVersion: input.workflow.definitionVersion,
      scheduledRunAt: input.scheduledRunAt,
    }),
    inputSnapshot: {
      scheduledRunAt: input.scheduledRunAt.toISOString(),
    },
    queue: input.queue,
  });

  if (result.outcome === "enqueued" && result.scheduleSlotCommitted) {
    await advanceVisualWorkflowNextRun({
      visualWorkflowId: input.workflow.id,
      organizationId: input.workflow.organizationId,
      completedAt: input.completedAt,
    });
  }

  return result;
}

export async function dispatchVisualWorkflowsForGithubPush(input: {
  deliveryId: string;
  organizationId: string;
  githubInstallationRepositoryId: string;
  branch: string;
  commitBefore: string;
  commitAfter: string;
  queue?: VisualWorkflowExecutionQueue;
}): Promise<VisualWorkflowDispatchResult[]> {
  const workflows = (await listAllActiveVisualWorkflows(input.organizationId)).filter((workflow) =>
    visualWorkflowShouldDispatchOnGithubPush(workflow, {
      githubInstallationRepositoryId: input.githubInstallationRepositoryId,
      branch: input.branch,
    }),
  );

  const results: VisualWorkflowDispatchResult[] = [];

  for (const workflow of workflows) {
    try {
      const result = await dispatchVisualWorkflowRun({
        workflow,
        triggerSource: "github",
        idempotencyKey: buildVisualWorkflowGithubIdempotencyKey({
          visualWorkflowId: workflow.id,
          definitionVersion: workflow.definitionVersion,
          githubDeliveryId: input.deliveryId,
        }),
        inputSnapshot: {
          githubDeliveryId: input.deliveryId,
          pushBranch: input.branch,
          commitBefore: input.commitBefore,
          commitAfter: input.commitAfter,
        },
        queue: input.queue,
      });
      results.push(result);
    } catch (error) {
      logger.error(
        {
          visualWorkflowId: workflow.id,
          deliveryId: input.deliveryId,
          error: error instanceof Error ? error.message : String(error),
        },
        "visual workflow github push dispatch failed",
      );
    }
  }

  return results;
}

export async function dispatchVisualWorkflowsForGithubPullRequest(input: {
  deliveryId: string;
  organizationId: string;
  githubInstallationRepositoryId: string;
  action: string;
  pullRequestNumber: number;
  pullRequestUrl?: string;
  baseBranch: string;
  headBranch: string;
  commitBefore: string;
  commitAfter: string;
  queue?: VisualWorkflowExecutionQueue;
}): Promise<VisualWorkflowDispatchResult[]> {
  const workflows = (await listAllActiveVisualWorkflows(input.organizationId)).filter((workflow) =>
    visualWorkflowShouldDispatchOnGithubPullRequest(workflow, {
      githubInstallationRepositoryId: input.githubInstallationRepositoryId,
      baseBranch: input.baseBranch,
    }),
  );

  const results: VisualWorkflowDispatchResult[] = [];

  for (const workflow of workflows) {
    try {
      const result = await dispatchVisualWorkflowRun({
        workflow,
        triggerSource: "github",
        idempotencyKey: buildVisualWorkflowGithubIdempotencyKey({
          visualWorkflowId: workflow.id,
          definitionVersion: workflow.definitionVersion,
          githubDeliveryId: input.deliveryId,
        }),
        inputSnapshot: {
          githubDeliveryId: input.deliveryId,
          githubEvent: "pull_request",
          githubAction: input.action,
          pullRequestNumber: input.pullRequestNumber,
          pullRequestUrl: input.pullRequestUrl,
          baseBranch: input.baseBranch,
          headBranch: input.headBranch,
          pushBranch: input.baseBranch,
          commitBefore: input.commitBefore,
          commitAfter: input.commitAfter,
        },
        queue: input.queue,
      });
      results.push(result);
    } catch (error) {
      logger.error(
        {
          visualWorkflowId: workflow.id,
          deliveryId: input.deliveryId,
          error: error instanceof Error ? error.message : String(error),
        },
        "visual workflow github pull request dispatch failed",
      );
    }
  }

  return results;
}

export async function dispatchVisualWorkflowsForSourceUpload(input: {
  organizationId: string;
  projectId: string;
  sourceFileId: string;
  queue?: VisualWorkflowExecutionQueue;
}): Promise<VisualWorkflowDispatchResult[]> {
  const workflows = (await listAllActiveVisualWorkflows(input.organizationId)).filter((workflow) =>
    visualWorkflowShouldDispatchOnSourceUpload(workflow, { projectId: input.projectId }),
  );

  const results: VisualWorkflowDispatchResult[] = [];

  for (const workflow of workflows) {
    try {
      const result = await dispatchVisualWorkflowRun({
        workflow,
        triggerSource: "source_upload",
        idempotencyKey: buildVisualWorkflowSourceUploadIdempotencyKey({
          visualWorkflowId: workflow.id,
          definitionVersion: workflow.definitionVersion,
          sourceFileId: input.sourceFileId,
        }),
        inputSnapshot: {
          projectId: input.projectId,
          sourceFileId: input.sourceFileId,
        },
        queue: input.queue,
      });
      results.push(result);
    } catch (error) {
      logger.error(
        {
          visualWorkflowId: workflow.id,
          sourceFileId: input.sourceFileId,
          error: error instanceof Error ? error.message : String(error),
        },
        "visual workflow source upload dispatch failed",
      );
    }
  }

  return results;
}

export async function dispatchDueScheduledVisualWorkflows(input?: {
  now?: Date;
  limit?: number;
  queue?: VisualWorkflowExecutionQueue;
}): Promise<VisualWorkflowDispatchResult[]> {
  const now = input?.now ?? new Date();
  const dueWorkflows = await listDueScheduledVisualWorkflows({
    now,
    limit: input?.limit,
  });

  const results: VisualWorkflowDispatchResult[] = [];

  for (const workflow of dueWorkflows) {
    try {
      const scheduledRunAt = workflow.nextRunAt ? new Date(workflow.nextRunAt) : null;
      if (!scheduledRunAt) {
        await advanceVisualWorkflowNextRun({
          visualWorkflowId: workflow.id,
          organizationId: workflow.organizationId,
          completedAt: now,
        });
        continue;
      }

      const result = await dispatchVisualWorkflowForScheduleAndAdvance({
        workflow,
        scheduledRunAt,
        completedAt: now,
        queue: input?.queue,
      });
      results.push(result);
    } catch (error) {
      logger.error(
        {
          visualWorkflowId: workflow.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "visual workflow scheduled dispatch failed",
      );
    }
  }

  return results;
}
