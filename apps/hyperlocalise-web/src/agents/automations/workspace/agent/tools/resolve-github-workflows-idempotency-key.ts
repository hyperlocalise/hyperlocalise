import {
  buildGithubPushAutomationIdempotencyKey,
  buildGithubScheduledAutomationIdempotencyKey,
} from "@/lib/agents/github/github-repository-automation-idempotency";
import {
  buildWorkspaceContentfulWebhookAutomationIdempotencyKey,
  buildWorkspaceGithubPushAutomationIdempotencyKey,
  buildWorkspaceManualAutomationIdempotencyKey,
  buildWorkspaceScheduledAutomationIdempotencyKey,
} from "@/lib/agents/workspace-automation-idempotency";

import type { WorkspaceOrchestratorSession } from "../context";

export function resolveGithubWorkflowsIdempotencyKey(input: {
  session: WorkspaceOrchestratorSession;
  configVersion: number;
  repositoryId: string;
  githubRepositoryId: string;
}) {
  const snapshot = input.session.run.inputSnapshot;
  const triggerSource = input.session.run.triggerSource;

  if (triggerSource === "manual") {
    const manualKey =
      typeof snapshot.manualIdempotencyKey === "string"
        ? snapshot.manualIdempotencyKey
        : input.session.run.id;
    return buildWorkspaceManualAutomationIdempotencyKey({
      automationId: input.session.automation.id,
      configVersion: input.configVersion,
      idempotencyKey: manualKey,
    });
  }

  if (triggerSource === "scheduled") {
    const scheduledRunAt =
      typeof snapshot.scheduledRunAt === "string" ? new Date(snapshot.scheduledRunAt) : new Date();
    return buildGithubScheduledAutomationIdempotencyKey({
      githubInstallationRepositoryId: input.repositoryId,
      configVersion: input.configVersion,
      scheduledRunAt,
    });
  }

  if (triggerSource === "github") {
    const pushBranch = typeof snapshot.pushBranch === "string" ? snapshot.pushBranch : null;
    const commitAfter = typeof snapshot.commitAfter === "string" ? snapshot.commitAfter : null;
    const commitBefore = typeof snapshot.commitBefore === "string" ? snapshot.commitBefore : "";
    const githubDeliveryId =
      typeof snapshot.githubDeliveryId === "string"
        ? snapshot.githubDeliveryId
        : input.session.run.id;

    if (pushBranch && commitAfter) {
      return buildGithubPushAutomationIdempotencyKey({
        organizationId: input.session.organizationId,
        githubInstallationRepositoryId: input.repositoryId,
        githubRepositoryId: input.githubRepositoryId,
        branch: pushBranch,
        commitBefore,
        commitAfter,
        configVersion: input.configVersion,
      });
    }

    return buildWorkspaceGithubPushAutomationIdempotencyKey({
      automationId: input.session.automation.id,
      configVersion: input.configVersion,
      githubDeliveryId,
    });
  }

  if (triggerSource === "contentful") {
    const contentfulWebhookEventId =
      typeof snapshot.contentfulWebhookEventId === "string"
        ? snapshot.contentfulWebhookEventId
        : input.session.run.id;
    return buildWorkspaceContentfulWebhookAutomationIdempotencyKey({
      automationId: input.session.automation.id,
      configVersion: input.configVersion,
      contentfulWebhookEventId,
    });
  }

  return buildWorkspaceScheduledAutomationIdempotencyKey({
    automationId: input.session.automation.id,
    configVersion: input.configVersion,
    scheduledRunAt: new Date(),
  });
}
