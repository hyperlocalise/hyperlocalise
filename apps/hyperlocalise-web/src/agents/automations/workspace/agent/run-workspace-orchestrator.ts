import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import {
  getWorkspaceAutomationById,
  getWorkspaceAutomationRunById,
  updateWorkspaceAutomationRun,
  type WorkspaceAutomationRunRecord,
  type WorkspaceAutomationRunStatus,
} from "@/lib/agents/workspace-automations";

import { createWorkspaceOrchestratorAgent } from "./agent";
import { composeWorkspaceAutomationInstructions } from "./compose-workspace-instructions";
import { createWorkspaceOrchestratorSession, type WorkspaceOrchestratorSession } from "./context";
import { buildWorkspaceOrchestratorPlan } from "./plan";
import { buildWorkspaceOrchestratorOutputSummary } from "./workspace-orchestrator-output-summary";

const logger = createLogger("workspace-orchestrator");

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
  planTools: string[];
  stepResults: Record<string, unknown>;
};

function resolveTemplateSkillId(inputSnapshot: Record<string, unknown>) {
  return typeof inputSnapshot.templateSkillId === "string" ? inputSnapshot.templateSkillId : null;
}

export function buildWorkspaceOrchestratorUserMessage(input: {
  automationName: string;
  triggerSource: WorkspaceAutomationRunRecord["triggerSource"];
  inputSnapshot: Record<string, unknown>;
}) {
  const lines = [
    `Execute automation "${input.automationName}" using the planned tools in order.`,
    `Trigger source: ${input.triggerSource}.`,
  ];

  if (input.triggerSource === "contentful") {
    if (typeof input.inputSnapshot.entryId === "string" && input.inputSnapshot.entryId.trim()) {
      lines.push(`Contentful entry ID: ${input.inputSnapshot.entryId.trim()}.`);
    }
    if (
      typeof input.inputSnapshot.contentTypeId === "string" &&
      input.inputSnapshot.contentTypeId.trim()
    ) {
      lines.push(`Contentful content type: ${input.inputSnapshot.contentTypeId.trim()}.`);
    }
  }

  lines.push("Apply customer instructions when running workflow tools.");
  return lines.join("\n");
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
      planTools: plan.tools,
      stepResults: {},
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
          content: buildWorkspaceOrchestratorUserMessage({
            automationName: automation.name,
            triggerSource: run.triggerSource,
            inputSnapshot: run.inputSnapshot,
          }),
        },
      ],
    });

    const terminalStatus = deriveTerminalStatus(session);
    const notificationWarnings = collectNotificationWarnings(session);

    const outputSummary = buildWorkspaceOrchestratorOutputSummary(
      run.outputSummary,
      session.stepResults,
      {
        notificationWarnings,
      },
    );

    await updateWorkspaceAutomationRun({
      runId: run.id,
      organizationId: input.organizationId,
      status: terminalStatus,
      outputSummary,
      error: session.terminalError ? { message: session.terminalError } : null,
      completedAt: new Date(),
    });

    logger.info(
      {
        workspaceAutomationRunId: run.id,
        organizationId: input.organizationId,
        planTools: plan.tools,
        terminalStatus,
        stepResults: session.stepResults,
        ...(session.terminalError ? { terminalError: session.terminalError } : {}),
      },
      "workspace orchestrator finished",
    );

    return ok({
      runId: run.id,
      status: terminalStatus,
      planTools: plan.tools,
      stepResults: session.stepResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "workspace_orchestrator_failed";
    await updateWorkspaceAutomationRun({
      runId: run.id,
      organizationId: input.organizationId,
      status: "failed",
      error: { message },
      outputSummary: buildWorkspaceOrchestratorOutputSummary(
        run.outputSummary,
        session.stepResults,
      ),
      completedAt: new Date(),
    });

    return err({
      code: "workspace_orchestrator_failed",
      message,
      runId: run.id,
    });
  }
}
