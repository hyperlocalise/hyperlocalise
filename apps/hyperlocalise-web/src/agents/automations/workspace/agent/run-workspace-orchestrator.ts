import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import {
  getWorkspaceAutomationById,
  getWorkspaceAutomationRunById,
  updateWorkspaceAutomationRun,
  type WorkspaceAutomationRunStatus,
} from "@/lib/agents/workspace-automations";

import { createWorkspaceOrchestratorAgent } from "./agent";
import { composeWorkspaceAutomationInstructions } from "./compose-workspace-instructions";
import { createWorkspaceOrchestratorSession, type WorkspaceOrchestratorSession } from "./context";
import { buildWorkspaceOrchestratorPlan } from "./plan";

export type WorkspaceOrchestratorExecutionError = {
  code:
    | "workspace_automation_not_found"
    | "workspace_automation_run_not_found"
    | "workspace_orchestrator_failed";
  message: string;
  runId?: string;
};

export type WorkspaceOrchestratorExecutionSuccess = {
  runId: string;
  status: WorkspaceAutomationRunStatus;
};

function resolveTemplateSkillId(inputSnapshot: Record<string, unknown>) {
  return typeof inputSnapshot.templateSkillId === "string" ? inputSnapshot.templateSkillId : null;
}

function collectNotificationWarnings(session: WorkspaceOrchestratorSession) {
  const warnings: Array<{ channel: "slack" | "email"; code: string; message: string }> = [];

  const slackResult = session.stepResults.notify_slack;
  if (slackResult && slackResult.sent === false) {
    warnings.push({
      channel: "slack",
      code: typeof slackResult.code === "string" ? slackResult.code : "slack_send_failed",
      message:
        typeof slackResult.message === "string"
          ? slackResult.message
          : "Slack notification failed.",
    });
  }

  const emailResult = session.stepResults.notify_email;
  if (emailResult && emailResult.sent === false) {
    warnings.push({
      channel: "email",
      code: typeof emailResult.code === "string" ? emailResult.code : "email_send_failed",
      message:
        typeof emailResult.message === "string"
          ? emailResult.message
          : "Email notification failed.",
    });
  }

  return warnings;
}

function deriveTerminalStatus(session: {
  terminalStatus: WorkspaceAutomationRunStatus | null;
  plan: { tools: string[] };
  stepResults: Record<string, unknown>;
}): WorkspaceAutomationRunStatus {
  if (session.terminalStatus) {
    return session.terminalStatus;
  }

  if (session.plan.tools.length === 0) {
    return "skipped";
  }

  return "succeeded";
}

export async function runWorkspaceOrchestrator(input: {
  workspaceAutomationRunId: string;
  organizationId: string;
}): Promise<Result<WorkspaceOrchestratorExecutionSuccess, WorkspaceOrchestratorExecutionError>> {
  const run = await getWorkspaceAutomationRunById({
    runId: input.workspaceAutomationRunId,
    organizationId: input.organizationId,
  });

  if (!run) {
    return err({
      code: "workspace_automation_run_not_found",
      message: "workspace automation run not found",
      runId: input.workspaceAutomationRunId,
    });
  }

  const automation = await getWorkspaceAutomationById({
    automationId: run.automationId,
    organizationId: input.organizationId,
  });

  if (!automation) {
    return err({
      code: "workspace_automation_not_found",
      message: "workspace automation not found",
      runId: run.id,
    });
  }

  const templateSkillId = resolveTemplateSkillId(run.inputSnapshot);
  const plan = buildWorkspaceOrchestratorPlan(automation, { templateSkillId });
  const composedInstructions = composeWorkspaceAutomationInstructions({
    templateSkillId,
    userOverride: automation.instructions,
    triggerMode: automation.triggerConfig.mode,
    plan,
  });

  let repository: {
    id: string;
    githubInstallationId: string;
    githubRepositoryId: string;
  } | null = null;

  if (
    automation.repositoryTarget.kind === "github" &&
    automation.repositoryTarget.githubInstallationRepositoryId
  ) {
    const [row] = await db
      .select()
      .from(schema.githubInstallationRepositories)
      .where(
        and(
          eq(
            schema.githubInstallationRepositories.id,
            automation.repositoryTarget.githubInstallationRepositoryId,
          ),
          eq(schema.githubInstallationRepositories.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    if (row) {
      repository = {
        id: row.id,
        githubInstallationId: row.githubInstallationId,
        githubRepositoryId: row.githubRepositoryId,
      };
    }
  }

  const session = createWorkspaceOrchestratorSession({
    organizationId: input.organizationId,
    automation,
    run,
    plan,
    repository,
    composedInstructions,
  });

  if (plan.tools.length === 0) {
    const completedAt = new Date();
    await updateWorkspaceAutomationRun({
      runId: run.id,
      organizationId: input.organizationId,
      status: "skipped",
      outputSummary: { skipReason: "no_enabled_tools" },
      completedAt,
    });

    return ok({
      runId: run.id,
      status: "skipped",
    });
  }

  await updateWorkspaceAutomationRun({
    runId: run.id,
    organizationId: input.organizationId,
    status: "running",
    startedAt: run.startedAt ? undefined : new Date(),
  });

  try {
    const agent = createWorkspaceOrchestratorAgent(session);
    await agent.generate({
      messages: [
        {
          role: "user",
          content: [
            `Execute automation "${automation.name}" using the planned tools in order.`,
            `Trigger source: ${run.triggerSource}.`,
            "Apply customer instructions when running workflow tools.",
          ].join("\n"),
        },
      ],
    });

    const terminalStatus = deriveTerminalStatus(session);
    const notificationWarnings = collectNotificationWarnings(session);

    const outputSummary = {
      ...run.outputSummary,
      orchestratorStepResults: session.stepResults,
      ...(notificationWarnings.length > 0 ? { notificationWarnings } : {}),
    };

    await updateWorkspaceAutomationRun({
      runId: run.id,
      organizationId: input.organizationId,
      status: terminalStatus,
      outputSummary,
      error: session.terminalError ? { message: session.terminalError } : null,
      completedAt: new Date(),
    });

    return ok({
      runId: run.id,
      status: terminalStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "workspace_orchestrator_failed";
    await updateWorkspaceAutomationRun({
      runId: run.id,
      organizationId: input.organizationId,
      status: "failed",
      error: { message },
      outputSummary: {
        ...run.outputSummary,
        orchestratorStepResults: session.stepResults,
      },
      completedAt: new Date(),
    });

    return err({
      code: "workspace_orchestrator_failed",
      message,
      runId: run.id,
    });
  }
}
