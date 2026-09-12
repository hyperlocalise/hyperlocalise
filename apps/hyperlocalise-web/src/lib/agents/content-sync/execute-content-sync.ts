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
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  getWorkspaceAutomationById,
  getWorkspaceAutomationRunById,
  updateWorkspaceAutomationRun,
} from "@/lib/agents/workspace-automations";
import { isContentSyncAutomation } from "@/lib/agents/workspace-automation-types";

import { executeGithubContentSync, type ContentSyncSummary } from "./execute-github-content-sync";

const logger = createLogger("content-sync");

export async function executeContentSyncRun(input: {
  organizationId: string;
  workspaceAutomationRunId: string;
}): Promise<
  Result<
    {
      runId: string;
      status: string;
      planTools: string[];
      stepResults: Record<string, unknown>;
    },
    {
      code:
        | "workspace_automation_not_found"
        | "workspace_automation_run_not_found"
        | "workspace_orchestrator_failed";
      message: string;
      runId?: string;
    }
  >
> {
  const run = await getWorkspaceAutomationRunById({
    organizationId: input.organizationId,
    runId: input.workspaceAutomationRunId,
  });
  if (!run) {
    return err({
      code: "workspace_automation_run_not_found",
      message: "Automation run was not found.",
      runId: input.workspaceAutomationRunId,
    });
  }

  const automation = await getWorkspaceAutomationById({
    organizationId: input.organizationId,
    automationId: run.automationId,
  });
  if (!automation || !isContentSyncAutomation(automation) || !automation.syncConfig) {
    return err({
      code: "workspace_automation_not_found",
      message: "Content sync automation was not found.",
      runId: run.id,
    });
  }

  const projectId = automation.projectId?.trim();
  if (!projectId) {
    await updateWorkspaceAutomationRun({
      runId: run.id,
      organizationId: input.organizationId,
      status: "failed",
      error: { code: "project_required", message: "Choose a Hyperlocalise project." },
      completedAt: new Date(),
    });
    return err({
      code: "workspace_orchestrator_failed",
      message: "Choose a Hyperlocalise project.",
      runId: run.id,
    });
  }

  await updateWorkspaceAutomationRun({
    runId: run.id,
    organizationId: input.organizationId,
    status: "running",
    startedAt: new Date(),
  });

  try {
    const result = await runContentSyncProvider({
      organizationId: input.organizationId,
      projectId,
      automationId: automation.id,
      runId: run.id,
      syncConfig: automation.syncConfig,
    });

    if (isErr(result)) {
      await updateWorkspaceAutomationRun({
        runId: run.id,
        organizationId: input.organizationId,
        status: "failed",
        error: result.error,
        completedAt: new Date(),
      });
      return err({
        code: "workspace_orchestrator_failed",
        message: result.error.message,
        runId: run.id,
      });
    }

    await updateWorkspaceAutomationRun({
      runId: run.id,
      organizationId: input.organizationId,
      status: "succeeded",
      outputSummary: result.value,
      completedAt: new Date(),
    });

    return ok({
      runId: run.id,
      status: "succeeded",
      planTools: ["content_sync"],
      stepResults: result.value,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "content_sync_failed";
    logger.error({ runId: run.id, message }, "content sync run threw");
    await updateWorkspaceAutomationRun({
      runId: run.id,
      organizationId: input.organizationId,
      status: "failed",
      error: { code: "content_sync_failed", message },
      completedAt: new Date(),
    });
    return err({
      code: "workspace_orchestrator_failed",
      message,
      runId: run.id,
    });
  }
}

async function runContentSyncProvider(input: {
  organizationId: string;
  projectId: string;
  automationId: string;
  runId: string;
  syncConfig: NonNullable<Awaited<ReturnType<typeof getWorkspaceAutomationById>>>["syncConfig"];
}): Promise<Result<ContentSyncSummary, { code: string; message: string }>> {
  if (!input.syncConfig) {
    return err({
      code: "content_sync_config_required",
      message: "Content sync requires a provider, resource, and project folder.",
    });
  }

  if (input.syncConfig.provider === "github") {
    return executeGithubContentSync({
      organizationId: input.organizationId,
      projectId: input.projectId,
      automationId: input.automationId,
      runId: input.runId,
      syncConfig: input.syncConfig,
    });
  }

  return err({
    code: "content_sync_provider_not_ready",
    message: `Content sync for ${input.syncConfig.provider} is not available yet.`,
  });
}
