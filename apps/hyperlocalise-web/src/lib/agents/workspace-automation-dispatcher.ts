import { createLogger } from "@/lib/log";
import { composeWorkspaceAutomationInstructions } from "@/agents/automations/workspace/agent/compose-workspace-instructions";
import { buildWorkspaceOrchestratorPlan } from "@/agents/automations/workspace/agent/plan";

import {
  buildWorkspaceContentfulScheduledAutomationIdempotencyKey,
  buildWorkspaceContentfulWebhookAutomationIdempotencyKey,
  buildWorkspaceGithubPushAutomationIdempotencyKey,
  buildWorkspaceManualAutomationIdempotencyKey,
  buildWorkspaceScheduledAutomationIdempotencyKey,
} from "./workspace-automation-idempotency";
import {
  hasWorkspaceAutomationGithubWorkflow,
  workspaceAutomationMatchesPushBranch,
} from "./workspace-automation-github-mapping";
import {
  advanceWorkspaceAutomationNextRun,
  createWorkspaceAutomationRun,
  getWorkspaceAutomationRunByIdempotencyKey,
  hasWorkspaceAutomationContentfulWorkflow,
  listDueContentfulWorkspaceAutomations,
  listWorkspaceAutomations,
  updateWorkspaceAutomationRun,
  type WorkspaceAutomationRecord,
  type WorkspaceAutomationRunTriggerSource,
} from "./workspace-automations";
import type { WorkspaceAutomationExecutionQueue } from "@/lib/workflow/types";
import { createWorkspaceAutomationExecutionQueue } from "@/workflows/adapters";

const logger = createLogger("workspace-automation-dispatch");

export type WorkspaceAutomationDispatchResult =
  | {
      outcome: "enqueued";
      runId: string;
      inserted: boolean;
    }
  | {
      outcome: "skipped";
      runId: string;
      inserted: boolean;
      skipReason: string;
    };

function orchestratorQueue(input?: WorkspaceAutomationExecutionQueue) {
  return input ?? createWorkspaceAutomationExecutionQueue();
}

function isTerminalRunStatus(status: string) {
  return (
    status === "succeeded" || status === "failed" || status === "skipped" || status === "cancelled"
  );
}

function resolveTemplateSkillId(inputSnapshot: Record<string, unknown>) {
  return typeof inputSnapshot.templateSkillId === "string" ? inputSnapshot.templateSkillId : null;
}

function resolveContentfulDispatchSkipReason(input: {
  automation: WorkspaceAutomationRecord;
  entryId: string | null;
  triggerSource: WorkspaceAutomationRunTriggerSource;
}) {
  const contentful = input.automation.toolConfig.contentful;
  if (!hasWorkspaceAutomationContentfulWorkflow(input.automation.toolConfig)) {
    return null;
  }

  if (!contentful?.connectionId) {
    return "contentful_connection_missing";
  }
  if (!contentful.projectId) {
    return "contentful_project_missing";
  }
  if (!contentful.sourceLocale?.trim()) {
    return "contentful_source_locale_missing";
  }
  if (!contentful.targetLocales?.length) {
    return "contentful_target_locales_missing";
  }
  if (!input.entryId) {
    return "contentful_entry_id_missing";
  }

  return null;
}

async function dispatchWorkspaceAutomationViaOrchestrator(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  triggerSource: WorkspaceAutomationRunTriggerSource;
  idempotencyKey: string;
  inputSnapshot?: Record<string, unknown>;
  preDispatchSkipReason?: string | null;
  queue?: WorkspaceAutomationExecutionQueue;
}): Promise<WorkspaceAutomationDispatchResult> {
  const snapshot = {
    automationConfigVersion: input.automation.configVersion,
    automationName: input.automation.name,
    instructions: input.automation.instructions,
    ...input.inputSnapshot,
  };

  const templateSkillId = resolveTemplateSkillId(snapshot);
  const plan = buildWorkspaceOrchestratorPlan(input.automation, { templateSkillId });
  const skipReason =
    input.preDispatchSkipReason ?? (plan.tools.length === 0 ? "no_enabled_tools" : null) ?? null;

  const existing = await getWorkspaceAutomationRunByIdempotencyKey({
    organizationId: input.organizationId,
    automationId: input.automation.id,
    idempotencyKey: input.idempotencyKey,
  });

  if (existing && isTerminalRunStatus(existing.status)) {
    if (existing.status === "skipped") {
      return {
        outcome: "skipped",
        runId: existing.id,
        inserted: false,
        skipReason:
          typeof existing.outputSummary.skipReason === "string"
            ? existing.outputSummary.skipReason
            : "automation_skipped",
      };
    }

    return {
      outcome: "enqueued",
      runId: existing.id,
      inserted: false,
    };
  }

  const run =
    existing ??
    (await createWorkspaceAutomationRun({
      automationId: input.automation.id,
      organizationId: input.organizationId,
      triggerSource: input.triggerSource,
      status: skipReason ? "skipped" : "queued",
      idempotencyKey: input.idempotencyKey,
      inputSnapshot: {
        ...snapshot,
        effectiveInstructions: composeWorkspaceAutomationInstructions({
          templateSkillId,
          userOverride: input.automation.instructions,
          triggerMode: input.automation.triggerConfig.mode,
          plan,
        }),
      },
      completedAt: skipReason ? new Date() : null,
      outputSummary: skipReason ? { skipReason } : {},
    }));

  const inserted = !existing;

  if (skipReason) {
    return {
      outcome: "skipped",
      runId: run.id,
      inserted,
      skipReason,
    };
  }

  if (
    typeof run.outputSummary.orchestratorEnqueuedAt === "string" &&
    run.outputSummary.orchestratorEnqueuedAt.length > 0
  ) {
    return {
      outcome: "enqueued",
      runId: run.id,
      inserted: false,
    };
  }

  await orchestratorQueue(input.queue).enqueue({
    workspaceAutomationRunId: run.id,
    organizationId: input.organizationId,
  });

  await updateWorkspaceAutomationRun({
    runId: run.id,
    organizationId: input.organizationId,
    outputSummary: {
      ...run.outputSummary,
      orchestratorEnqueuedAt: new Date().toISOString(),
    },
  });

  return {
    outcome: "enqueued",
    runId: run.id,
    inserted,
  };
}

export async function dispatchManualWorkspaceAutomationRun(input: {
  automation: WorkspaceAutomationRecord;
  idempotencyKey: string;
  inputSnapshot?: Record<string, unknown>;
  queue?: WorkspaceAutomationExecutionQueue;
}): Promise<WorkspaceAutomationDispatchResult | null> {
  if (input.automation.status !== "active") {
    return null;
  }

  if (input.automation.triggerConfig.mode !== "manual") {
    return null;
  }

  const plan = buildWorkspaceOrchestratorPlan(input.automation, {
    templateSkillId:
      typeof input.inputSnapshot?.templateSkillId === "string"
        ? input.inputSnapshot.templateSkillId
        : null,
  });
  if (plan.tools.length === 0) {
    return null;
  }

  const contentfulEntryId =
    typeof input.inputSnapshot?.entryId === "string"
      ? input.inputSnapshot.entryId
      : (input.automation.toolConfig.contentful?.entryId ?? null);

  return dispatchWorkspaceAutomationViaOrchestrator({
    organizationId: input.automation.organizationId,
    automation: input.automation,
    triggerSource: "manual",
    idempotencyKey: buildWorkspaceManualAutomationIdempotencyKey({
      automationId: input.automation.id,
      configVersion: input.automation.configVersion,
      idempotencyKey: input.idempotencyKey,
    }),
    inputSnapshot: {
      ...input.inputSnapshot,
      manualIdempotencyKey: input.idempotencyKey,
      entryId: contentfulEntryId ?? undefined,
    },
    preDispatchSkipReason: resolveContentfulDispatchSkipReason({
      automation: input.automation,
      entryId: contentfulEntryId,
      triggerSource: "manual",
    }),
    queue: input.queue,
  });
}

export async function dispatchWorkspaceAutomationForSchedule(input: {
  automation: WorkspaceAutomationRecord;
  scheduledRunAt: Date;
  queue?: WorkspaceAutomationExecutionQueue;
}): Promise<WorkspaceAutomationDispatchResult | null> {
  if (input.automation.status !== "active") {
    return null;
  }

  if (input.automation.triggerConfig.mode !== "scheduled") {
    return null;
  }

  const plan = buildWorkspaceOrchestratorPlan(input.automation);
  if (plan.tools.length === 0) {
    return null;
  }

  const contentfulEntryId = input.automation.toolConfig.contentful?.entryId ?? null;

  return dispatchWorkspaceAutomationViaOrchestrator({
    organizationId: input.automation.organizationId,
    automation: input.automation,
    triggerSource: "scheduled",
    idempotencyKey: buildWorkspaceScheduledAutomationIdempotencyKey({
      automationId: input.automation.id,
      configVersion: input.automation.configVersion,
      scheduledRunAt: input.scheduledRunAt,
    }),
    inputSnapshot: {
      scheduledRunAt: input.scheduledRunAt.toISOString(),
      entryId: contentfulEntryId ?? undefined,
    },
    preDispatchSkipReason: resolveContentfulDispatchSkipReason({
      automation: input.automation,
      entryId: contentfulEntryId,
      triggerSource: "scheduled",
    }),
    queue: input.queue,
  });
}

export async function dispatchWorkspaceAutomationsForGithubPush(input: {
  deliveryId: string;
  organizationId: string;
  githubInstallationRepositoryId: string;
  branch: string;
  commitBefore: string;
  commitAfter: string;
  queue?: WorkspaceAutomationExecutionQueue;
}): Promise<WorkspaceAutomationDispatchResult[]> {
  const automations = (
    await listWorkspaceAutomations({
      organizationId: input.organizationId,
      status: "active",
      limit: 100,
    })
  ).filter(
    (automation) =>
      automation.repositoryTarget.kind === "github" &&
      automation.repositoryTarget.githubInstallationRepositoryId ===
        input.githubInstallationRepositoryId &&
      automation.triggerConfig.mode === "github" &&
      workspaceAutomationMatchesPushBranch(automation, input.branch) &&
      hasWorkspaceAutomationGithubWorkflow(automation.toolConfig),
  );

  const results: WorkspaceAutomationDispatchResult[] = [];

  for (const automation of automations) {
    try {
      const result = await dispatchWorkspaceAutomationViaOrchestrator({
        organizationId: input.organizationId,
        automation,
        triggerSource: "github",
        idempotencyKey: buildWorkspaceGithubPushAutomationIdempotencyKey({
          automationId: automation.id,
          configVersion: automation.configVersion,
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
          automationId: automation.id,
          deliveryId: input.deliveryId,
          error: error instanceof Error ? error.message : String(error),
        },
        "workspace automation github push dispatch failed",
      );
    }
  }

  return results;
}

export async function dispatchWorkspaceAutomationForScheduleAndAdvance(input: {
  automation: WorkspaceAutomationRecord;
  scheduledRunAt: Date;
  completedAt?: Date;
  queue?: WorkspaceAutomationExecutionQueue;
}) {
  const result = await dispatchWorkspaceAutomationForSchedule({
    automation: input.automation,
    scheduledRunAt: input.scheduledRunAt,
    queue: input.queue,
  });
  await advanceWorkspaceAutomationNextRun({
    automationId: input.automation.id,
    organizationId: input.automation.organizationId,
    completedAt: input.completedAt,
  });
  return result;
}

export async function dispatchWorkspaceAutomationsForContentfulWebhook(input: {
  organizationId: string;
  connectionId: string;
  contentfulWebhookEventId: string;
  entryId: string | null;
  contentTypeId?: string | null;
  queue?: WorkspaceAutomationExecutionQueue;
}): Promise<WorkspaceAutomationDispatchResult[]> {
  const candidateAutomations = await listWorkspaceAutomations({
    organizationId: input.organizationId,
    status: "active",
    contentfulWebhookConnectionId: input.connectionId,
    contentfulWebhookContentTypeId: input.contentTypeId,
    limit: 100,
  });
  const automations = candidateAutomations.filter((automation) =>
    hasWorkspaceAutomationContentfulWorkflow(automation.toolConfig),
  );

  logger.info(
    {
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      contentfulWebhookEventId: input.contentfulWebhookEventId,
      hasEntryId: Boolean(input.entryId),
      hasContentTypeId: Boolean(input.contentTypeId),
      candidateAutomationCount: candidateAutomations.length,
      runnableAutomationCount: automations.length,
    },
    "workspace automation contentful webhook automations resolved",
  );

  const results: WorkspaceAutomationDispatchResult[] = [];
  for (const automation of automations) {
    try {
      const result = await dispatchWorkspaceAutomationViaOrchestrator({
        organizationId: input.organizationId,
        automation,
        triggerSource: "contentful",
        idempotencyKey: buildWorkspaceContentfulWebhookAutomationIdempotencyKey({
          automationId: automation.id,
          configVersion: automation.configVersion,
          contentfulWebhookEventId: input.contentfulWebhookEventId,
        }),
        inputSnapshot: {
          connectionId: input.connectionId,
          entryId: input.entryId ?? undefined,
          contentTypeId: input.contentTypeId ?? undefined,
          contentfulWebhookEventId: input.contentfulWebhookEventId,
        },
        preDispatchSkipReason: resolveContentfulDispatchSkipReason({
          automation,
          entryId: input.entryId,
          triggerSource: "contentful",
        }),
        queue: input.queue,
      });
      results.push(result);
    } catch (error) {
      logger.error(
        {
          automationId: automation.id,
          contentfulWebhookEventId: input.contentfulWebhookEventId,
          error: error instanceof Error ? error.message : String(error),
        },
        "workspace automation contentful webhook dispatch failed",
      );
    }
  }

  return results;
}

export async function dispatchContentfulWorkspaceAutomationForSchedule(input: {
  automation: WorkspaceAutomationRecord;
  scheduledRunAt: Date;
  queue?: WorkspaceAutomationExecutionQueue;
}): Promise<WorkspaceAutomationDispatchResult | null> {
  return dispatchWorkspaceAutomationForSchedule({
    automation: input.automation,
    scheduledRunAt: input.scheduledRunAt,
    queue: input.queue,
  });
}

export async function dispatchContentfulWorkspaceAutomationForManual(input: {
  automation: WorkspaceAutomationRecord;
  idempotencyKey?: string | null;
  queue?: WorkspaceAutomationExecutionQueue;
}): Promise<WorkspaceAutomationDispatchResult | null> {
  if (!input.idempotencyKey) {
    return null;
  }

  return dispatchManualWorkspaceAutomationRun({
    automation: input.automation,
    idempotencyKey: input.idempotencyKey,
    queue: input.queue,
  });
}

export async function dispatchDueContentfulWorkspaceAutomations(input?: {
  now?: Date;
  limit?: number;
  queue?: WorkspaceAutomationExecutionQueue;
}) {
  const now = input?.now ?? new Date();
  const automations = await listDueContentfulWorkspaceAutomations({
    now,
    limit: input?.limit,
  });

  const results: WorkspaceAutomationDispatchResult[] = [];
  for (const automation of automations) {
    if (
      hasWorkspaceAutomationGithubWorkflow(automation.toolConfig) &&
      automation.repositoryTarget.kind === "github"
    ) {
      continue;
    }

    const scheduledRunAt = automation.nextRunAt ? new Date(automation.nextRunAt) : now;
    try {
      const result = await dispatchWorkspaceAutomationForSchedule({
        automation,
        scheduledRunAt,
        queue: input?.queue,
      });
      await advanceWorkspaceAutomationNextRun({
        automationId: automation.id,
        organizationId: automation.organizationId,
        completedAt: now,
      });
      if (result) {
        results.push(result);
      }
    } catch (error) {
      logger.error(
        {
          automationId: automation.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "workspace automation contentful scheduled dispatch failed",
      );
    }
  }

  return results;
}
