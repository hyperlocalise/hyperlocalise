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
import { isAutumnBooleanFeatureEnabled } from "@/lib/billing/autumn-boolean-feature-access";
import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import { and, eq, gte, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import type { JobChangeEventRecord } from "@/lib/job-change-events/job-change-events-contract";
import { createLogger } from "@/lib/log";
import type { VisualWorkflowExecutionQueue } from "@/lib/workflow/types";
import { createVisualWorkflowExecutionQueue } from "@/workflows/adapters";

import {
  buildVisualWorkflowGithubIdempotencyKey,
  buildVisualWorkflowJobChangedIdempotencyKey,
  buildVisualWorkflowScheduledIdempotencyKey,
  buildVisualWorkflowSourceUploadIdempotencyKey,
  buildVisualWorkflowWebhookIdempotencyKey,
} from "./dispatch/idempotency";
import {
  getVisualWorkflowTriggerNode,
  visualWorkflowShouldDispatchOnGithubPullRequest,
  visualWorkflowShouldDispatchOnGithubPush,
  visualWorkflowShouldDispatchOnJobChange,
  visualWorkflowShouldDispatchOnSourceUpload,
} from "./dispatch/trigger-matching";
import { verifyVisualWorkflowWebhookToken } from "./dispatch/webhook-token";
import {
  advanceVisualWorkflowNextRun,
  getActivePublishedVisualWorkflowById,
  listDueScheduledVisualWorkflows,
  listVisualWorkflows,
} from "./visual-workflows";
import {
  createVisualWorkflowRun,
  enqueueVisualWorkflowRunOnce,
  getVisualWorkflowRunByIdempotencyKey,
  VisualWorkflowDispatchMismatchError,
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
    workflows.push(
      ...page
        .filter((workflow) => workflow.publishedDefinition)
        .map((workflow) => ({
          ...workflow,
          definition: workflow.publishedDefinition!,
          definitionVersion: workflow.publishedVersion!,
        })),
    );

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
    const enqueueResult = await enqueueVisualWorkflowRunOnce({
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
      enqueued: enqueueResult.enqueuedNow,
      scheduleSlotCommitted: enqueueResult.scheduleSlotCommitted,
    };
  }

  let run: VisualWorkflowRunRecord;
  try {
    run = await createVisualWorkflowRun({
      organizationId: input.workflow.organizationId,
      visualWorkflowId: input.workflow.id,
      triggerSource: input.triggerSource,
      idempotencyKey: input.idempotencyKey,
      inputSnapshot: input.inputSnapshot,
      matchedDefinitionVersion: input.workflow.definitionVersion,
    });
  } catch (error) {
    if (error instanceof VisualWorkflowDispatchMismatchError) {
      return {
        outcome: "skipped",
        runId: "",
        inserted: false,
        enqueued: false,
        scheduleSlotCommitted: false,
        skipReason: error.reason,
      };
    }
    throw error;
  }

  const enqueueResult = await enqueueVisualWorkflowRunOnce({
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
    enqueued: enqueueResult.enqueuedNow,
    scheduleSlotCommitted: enqueueResult.scheduleSlotCommitted,
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
    } catch {
      logger.error(
        {
          visualWorkflowId: workflow.id,
          deliveryId: input.deliveryId,
          error: "workflow_dispatch_failed",
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
    } catch {
      logger.error(
        {
          visualWorkflowId: workflow.id,
          deliveryId: input.deliveryId,
          error: "workflow_dispatch_failed",
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
    } catch {
      logger.error(
        {
          visualWorkflowId: workflow.id,
          sourceFileId: input.sourceFileId,
          error: "workflow_dispatch_failed",
        },
        "visual workflow source upload dispatch failed",
      );
    }
  }

  return results;
}

/**
 * A workflow started by a job change can change that job again (Update job, Create task), which
 * starts it again. Past this many runs for one job in the window, further changes to that job are
 * skipped so such a loop dies out instead of running forever.
 */
export const JOB_CHANGED_RUNS_PER_JOB_LIMIT = 20;
const JOB_CHANGED_RUNS_WINDOW_MS = 60 * 60 * 1000;

async function countRecentJobChangedRuns(input: {
  organizationId: string;
  visualWorkflowId: string;
  jobId: string;
  now: Date;
}): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.visualWorkflowRuns)
    .where(
      and(
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
        eq(schema.visualWorkflowRuns.visualWorkflowId, input.visualWorkflowId),
        eq(schema.visualWorkflowRuns.triggerSource, "job_changed"),
        gte(
          schema.visualWorkflowRuns.createdAt,
          new Date(input.now.getTime() - JOB_CHANGED_RUNS_WINDOW_MS),
        ),
        sql`${schema.visualWorkflowRuns.inputSnapshot}->>'jobId' = ${input.jobId}`,
      ),
    );
  return row?.count ?? 0;
}

/** Workflows a tick has already loaded, by organization, so a burst of changes loads them once. */
export type ActiveVisualWorkflowCache = Map<string, Promise<VisualWorkflowRecord[]>>;

export async function dispatchVisualWorkflowsForJobChange(input: {
  event: JobChangeEventRecord;
  cache?: ActiveVisualWorkflowCache;
  queue?: VisualWorkflowExecutionQueue;
  now?: Date;
}): Promise<VisualWorkflowDispatchResult[]> {
  const { event } = input;
  let activeWorkflows = input.cache?.get(event.organizationId);
  if (!activeWorkflows) {
    activeWorkflows = listAllActiveVisualWorkflows(event.organizationId);
    input.cache?.set(event.organizationId, activeWorkflows);
  }
  const workflows = (await activeWorkflows).filter((workflow) =>
    visualWorkflowShouldDispatchOnJobChange(workflow, event),
  );

  const results: VisualWorkflowDispatchResult[] = [];
  for (const workflow of workflows) {
    const recentRuns = await countRecentJobChangedRuns({
      organizationId: event.organizationId,
      visualWorkflowId: workflow.id,
      jobId: event.jobId,
      now: input.now ?? new Date(),
    });
    if (recentRuns >= JOB_CHANGED_RUNS_PER_JOB_LIMIT) {
      logger.warn(
        { visualWorkflowId: workflow.id, jobId: event.jobId, jobChangeEventId: event.id },
        "visual workflow job change dispatch skipped; too many runs for this job",
      );
      results.push({
        outcome: "skipped",
        runId: "",
        inserted: false,
        enqueued: false,
        scheduleSlotCommitted: false,
        skipReason: "job_changed_run_limit",
      });
      continue;
    }

    // Let a failure reach the caller: the event stays undispatched and the next tick retries it,
    // and the idempotency key keeps runs that already started from starting twice.
    results.push(
      await dispatchVisualWorkflowRun({
        workflow,
        triggerSource: "job_changed",
        idempotencyKey: buildVisualWorkflowJobChangedIdempotencyKey({
          visualWorkflowId: workflow.id,
          definitionVersion: workflow.definitionVersion,
          jobChangeEventId: event.id,
        }),
        inputSnapshot: {
          eventId: event.id,
          eventType: event.type,
          jobId: event.jobId,
          jobKind: event.kind,
          projectId: event.projectId,
          status: event.toStatus,
          previousStatus: event.fromStatus,
          assigneeType: event.assigneeType,
        },
        queue: input.queue,
      }),
    );
  }

  return results;
}

export type VisualWorkflowWebhookDispatchResult =
  | { outcome: "not_found" }
  | { outcome: "unauthorized" }
  | { outcome: "feature_unavailable" }
  | VisualWorkflowDispatchResult;

/** Starts a run of the workflow a webhook URL belongs to, once per delivery id. */
export async function dispatchVisualWorkflowForWebhook(input: {
  visualWorkflowId: string;
  token: string;
  deliveryId: string;
  body: unknown;
  query: Record<string, string>;
  queue?: VisualWorkflowExecutionQueue;
}): Promise<VisualWorkflowWebhookDispatchResult> {
  const workflow = await getActivePublishedVisualWorkflowById({
    visualWorkflowId: input.visualWorkflowId,
  });
  const trigger = workflow ? getVisualWorkflowTriggerNode(workflow.definition) : undefined;
  if (!workflow || trigger?.config.kind !== "trigger.webhook") {
    return { outcome: "not_found" };
  }
  if (
    !verifyVisualWorkflowWebhookToken({
      visualWorkflowId: workflow.id,
      tokenVersion: trigger.config.tokenVersion,
      token: input.token,
    })
  ) {
    return { outcome: "unauthorized" };
  }
  if (
    !(await isAutumnBooleanFeatureEnabled({
      organizationId: workflow.organizationId,
      featureId: autumnFeatureIds.automationWorkflow,
    }))
  ) {
    return { outcome: "feature_unavailable" };
  }

  return dispatchVisualWorkflowRun({
    workflow,
    triggerSource: "webhook",
    idempotencyKey: buildVisualWorkflowWebhookIdempotencyKey({
      visualWorkflowId: workflow.id,
      definitionVersion: workflow.definitionVersion,
      deliveryId: input.deliveryId,
    }),
    inputSnapshot: {
      body: input.body,
      query: input.query,
      deliveryId: input.deliveryId,
    },
    queue: input.queue,
  });
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
    } catch {
      logger.error(
        {
          visualWorkflowId: workflow.id,
          error: "workflow_dispatch_failed",
        },
        "visual workflow scheduled dispatch failed",
      );
    }
  }

  return results;
}
