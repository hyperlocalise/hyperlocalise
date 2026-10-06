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
import { asSchema, type JSONSchema7 } from "ai";
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { hyperlocaliseAgentMaxOutputTokens } from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import {
  beginAgentRuntimeUsage,
  completeAgentRuntimeUsage,
  extractAiSdkTokenUsage,
} from "@/lib/billing/agent-runtime-usage";
import { createLogger } from "@/lib/log";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import {
  getWorkspaceAutomationById,
  getWorkspaceAutomationRunById,
  updateWorkspaceAutomationRun,
} from "@/lib/agents/workspace-automations";
import {
  claimWorkspaceAutomationToolAttempt,
  settleWorkspaceAutomationToolAttempt,
} from "@/lib/agents/workspace-automation-tool-attempts";
import {
  resolveWorkspaceAutomationModel,
  type WorkspaceAutomationModel,
  type WorkspaceAutomationRecord,
  type WorkspaceAutomationRunRecord,
  type WorkspaceAutomationRunStatus,
} from "@/lib/agents/workspace-automation-types";

import { buildWorkspaceOrchestratorTools } from "./build-workspace-orchestrator-tools";
import { WORKSPACE_AUTOMATION_RUN_CANCELLED } from "./durable-tool-budget";
import { composeWorkspaceAutomationInstructions } from "./compose-workspace-instructions";
import {
  createWorkspaceOrchestratorSession,
  type WorkspaceOrchestratorRepository,
  type WorkspaceOrchestratorSession,
} from "./context";
import {
  buildWorkspaceOrchestratorPlan,
  planHasActionableTool,
  type WorkspaceOrchestratorPlan,
  type WorkspaceOrchestratorToolName,
} from "./plan";
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

/** Run state shared between planned tools. Plain data so it can cross workflow step boundaries. */
export type WorkspaceOrchestratorToolState = {
  stepResults: WorkspaceOrchestratorSession["stepResults"];
  terminalStatus: WorkspaceAutomationRunStatus | null;
  terminalError: string | null;
};

export type WorkspaceOrchestratorToolSpec = {
  name: WorkspaceOrchestratorToolName;
  description: string;
  inputJsonSchema: JSONSchema7;
};

export type WorkspaceOrchestratorPrepared =
  | { kind: "completed"; result: WorkspaceOrchestratorExecutionSuccess }
  | {
      kind: "ready";
      runId: string;
      model: WorkspaceAutomationModel;
      instructions: string;
      userMessage: string;
      maxOutputTokens: number;
      planTools: WorkspaceOrchestratorToolName[];
      toolSpecs: WorkspaceOrchestratorToolSpec[];
    };

export type WorkspaceOrchestratorToolOutcome =
  | { ok: true; output: unknown; state: WorkspaceOrchestratorToolState }
  | {
      ok: false;
      message: string;
      state: WorkspaceOrchestratorToolState;
      /** The run was cancelled; the agent loop should stop instead of moving to the next tool. */
      cancelled?: true;
    };

/**
 * Tools that are safe to run again when a workflow step is retried: read-only tools, and tools
 * that deduplicate their own side effects (GitHub job claims, Contentful run reuse). Every other
 * tool runs at most once per run.
 */
const RETRY_SAFE_TOOLS = new Set<WorkspaceOrchestratorToolName>([
  "use_github_repository",
  "use_gitlab_repository",
  "run_github_workflows",
  "run_contentful_translation",
  "list_issues",
  "use_semrush",
  "use_ahrefs",
  "use_web_search",
  "recall_memory",
]);

type WorkspaceOrchestratorRunInput = {
  workspaceAutomationRunId: string;
  organizationId: string;
};

type WorkspaceOrchestratorContext = {
  run: WorkspaceAutomationRunRecord;
  automation: WorkspaceAutomationRecord;
  session: WorkspaceOrchestratorSession;
};

export function createWorkspaceOrchestratorToolState(): WorkspaceOrchestratorToolState {
  return { stepResults: {}, terminalStatus: null, terminalError: null };
}

function resolveTemplateSkillId(inputSnapshot: Record<string, unknown>) {
  return typeof inputSnapshot.templateSkillId === "string" ? inputSnapshot.templateSkillId : null;
}

function usageDimensions(automationId: string) {
  return {
    surface: "automation",
    agent_surface: "workspace_orchestrator",
    automation_id: automationId,
  };
}

function usageOperationKey(runId: string) {
  return `workspace-automation:${runId}:agent_runs`;
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

  if (input.triggerSource === "github") {
    const pullRequestNumber =
      typeof input.inputSnapshot.pullRequestNumber === "number"
        ? input.inputSnapshot.pullRequestNumber
        : null;
    const baseBranch =
      typeof input.inputSnapshot.baseBranch === "string"
        ? input.inputSnapshot.baseBranch.trim()
        : "";
    const headBranch =
      typeof input.inputSnapshot.headBranch === "string"
        ? input.inputSnapshot.headBranch.trim()
        : "";
    const pushBranch =
      typeof input.inputSnapshot.pushBranch === "string"
        ? input.inputSnapshot.pushBranch.trim()
        : "";
    const commitBefore =
      typeof input.inputSnapshot.commitBefore === "string"
        ? input.inputSnapshot.commitBefore.trim()
        : "";
    const commitAfter =
      typeof input.inputSnapshot.commitAfter === "string"
        ? input.inputSnapshot.commitAfter.trim()
        : "";
    if (pullRequestNumber) {
      lines.push(`GitHub pull request: #${pullRequestNumber}.`);
      if (baseBranch && headBranch) {
        lines.push(`GitHub pull request branches: ${headBranch} into ${baseBranch}.`);
      }
    } else if (pushBranch) {
      lines.push(`GitHub push branch: ${pushBranch}.`);
    }
    if (commitBefore && commitAfter) {
      lines.push(
        pullRequestNumber
          ? `GitHub pull request commits: ${commitBefore}..${commitAfter}.`
          : `GitHub push commits: ${commitBefore}..${commitAfter}.`,
      );
    } else if (commitAfter) {
      lines.push(
        pullRequestNumber
          ? `GitHub pull request commit: ${commitAfter}.`
          : `GitHub push commit: ${commitAfter}.`,
      );
    }
  }

  lines.push("Apply customer instructions when running workflow tools.");
  return lines.join("\n");
}

function collectNotificationWarnings(stepResults: WorkspaceOrchestratorToolState["stepResults"]) {
  const warnings: Array<{
    channel: "slack" | "email" | "github_comment";
    code: string;
    message: string;
  }> = [];

  const slackResult = stepResults.notify_slack;
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

  const emailResult = stepResults.notify_email;
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

  const githubCommentResult = stepResults.notify_github_comment;
  if (
    githubCommentResult &&
    githubCommentResult.posted === false &&
    githubCommentResult.skipped !== true
  ) {
    warnings.push({
      channel: "github_comment",
      code:
        typeof githubCommentResult.code === "string"
          ? githubCommentResult.code
          : "github_comment_send_failed",
      message:
        typeof githubCommentResult.message === "string"
          ? githubCommentResult.message
          : "GitHub comment failed.",
    });
  }

  return warnings;
}

function deriveTerminalStatus(input: {
  terminalStatus: WorkspaceAutomationRunStatus | null;
  plan: WorkspaceOrchestratorPlan;
}): WorkspaceAutomationRunStatus {
  if (input.terminalStatus) {
    return input.terminalStatus;
  }

  if (!planHasActionableTool(input.plan)) {
    return "skipped";
  }

  return "succeeded";
}

async function loadRepository(
  automation: WorkspaceAutomationRecord,
  organizationId: string,
): Promise<WorkspaceOrchestratorRepository | null> {
  if (
    automation.repositoryTarget.kind !== "github" ||
    !automation.repositoryTarget.githubInstallationRepositoryId
  ) {
    return null;
  }

  const [row] = await db
    .select()
    .from(schema.githubInstallationRepositories)
    .where(
      and(
        eq(
          schema.githubInstallationRepositories.id,
          automation.repositoryTarget.githubInstallationRepositoryId,
        ),
        eq(schema.githubInstallationRepositories.organizationId, organizationId),
      ),
    )
    .limit(1);

  return row
    ? {
        id: row.id,
        githubInstallationId: row.githubInstallationId,
        githubRepositoryId: row.githubRepositoryId,
      }
    : null;
}

/**
 * Load the run, automation, and a fresh session. Each workflow step reloads from the database so
 * tools see the latest run output summary. Pass `planTools` after preparation so a mid-run edit to
 * the automation cannot change which tools the run executes.
 */
async function loadWorkspaceOrchestratorContext(
  input: WorkspaceOrchestratorRunInput & { planTools?: WorkspaceOrchestratorToolName[] },
): Promise<Result<WorkspaceOrchestratorContext, WorkspaceOrchestratorExecutionError>> {
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
  const plan = input.planTools
    ? { tools: input.planTools }
    : buildWorkspaceOrchestratorPlan(automation, { templateSkillId });
  const composedInstructions = composeWorkspaceAutomationInstructions({
    templateSkillId,
    // Read from the automation, as the plan and instructions are, so a run never mixes the
    // skills of one saved configuration with the tools of another.
    skillIds: automation.skillIds ?? [],
    userOverride: automation.instructions,
    triggerMode: automation.triggerConfig.mode,
    plan,
  });

  const session = createWorkspaceOrchestratorSession({
    organizationId: input.organizationId,
    automation,
    run,
    plan,
    repository: await loadRepository(automation, input.organizationId),
    composedInstructions,
  });

  return ok({ run, automation, session });
}

/**
 * Mark the run running, reserve agent usage, and describe the planned tools for the durable agent
 * loop. Returns `completed` when the run finishes without needing the agent (no enabled tools).
 */
export async function prepareWorkspaceOrchestratorRun(
  input: WorkspaceOrchestratorRunInput,
): Promise<Result<WorkspaceOrchestratorPrepared, WorkspaceOrchestratorExecutionError>> {
  const context = await loadWorkspaceOrchestratorContext(input);
  if (!context.ok) {
    return context;
  }

  const { run, automation, session } = context.value;
  const plan = session.plan;

  if (!planHasActionableTool(plan)) {
    await updateWorkspaceAutomationRun({
      runId: run.id,
      organizationId: input.organizationId,
      status: "skipped",
      outputSummary: { skipReason: "no_enabled_tools" },
      completedAt: new Date(),
    });

    return ok({
      kind: "completed",
      result: { runId: run.id, status: "skipped", planTools: plan.tools, stepResults: {} },
    });
  }

  await updateWorkspaceAutomationRun({
    runId: run.id,
    organizationId: input.organizationId,
    status: "running",
    startedAt: run.startedAt ? undefined : new Date(),
  });

  try {
    await beginAgentRuntimeUsage({
      organizationId: input.organizationId,
      operationKey: usageOperationKey(run.id),
      source: "workspace_orchestrator",
      dimensions: usageDimensions(automation.id),
    });

    const tools = buildWorkspaceOrchestratorTools(session);
    const toolSpecs = await Promise.all(
      plan.tools.map(async (name): Promise<WorkspaceOrchestratorToolSpec> => {
        const description = tools[name]?.description;
        return {
          name,
          description: typeof description === "string" ? description : "",
          inputJsonSchema: await asSchema(tools[name]?.inputSchema).jsonSchema,
        };
      }),
    );

    return ok({
      kind: "ready",
      runId: run.id,
      model: resolveWorkspaceAutomationModel(automation.model),
      instructions: session.composedInstructions,
      userMessage: buildWorkspaceOrchestratorUserMessage({
        automationName: automation.name,
        triggerSource: run.triggerSource,
        inputSnapshot: run.inputSnapshot,
      }),
      maxOutputTokens: hyperlocaliseAgentMaxOutputTokens,
      planTools: plan.tools,
      toolSpecs,
    });
  } catch (error) {
    return err(
      await failWorkspaceOrchestratorRun({
        ...input,
        state: createWorkspaceOrchestratorToolState(),
        message: error instanceof Error ? error.message : "workspace_orchestrator_failed",
      }),
    );
  }
}

export function readWorkspaceOrchestratorToolState(
  session: WorkspaceOrchestratorSession,
): WorkspaceOrchestratorToolState {
  return {
    stepResults: session.stepResults,
    terminalStatus: session.terminalStatus,
    terminalError: session.terminalError,
  };
}

/**
 * Rebuild the session for one tool step and apply the run state carried between steps. Fails
 * with `cancelled` once the run has been cancelled so no further tool starts.
 */
export async function loadWorkspaceOrchestratorToolSession(
  input: WorkspaceOrchestratorRunInput & {
    planTools: WorkspaceOrchestratorToolName[];
    state: WorkspaceOrchestratorToolState;
  },
): Promise<
  | { ok: true; session: WorkspaceOrchestratorSession }
  | Extract<WorkspaceOrchestratorToolOutcome, { ok: false }>
> {
  const context = await loadWorkspaceOrchestratorContext(input);
  if (!context.ok) {
    return { ok: false, message: context.error.message, state: input.state };
  }

  if (context.value.run.status === "cancelled") {
    return {
      ok: false,
      message: WORKSPACE_AUTOMATION_RUN_CANCELLED,
      state: input.state,
      cancelled: true,
    };
  }

  const session = context.value.session;
  session.stepResults = { ...input.state.stepResults };
  session.terminalStatus = input.state.terminalStatus;
  session.terminalError = input.state.terminalError;
  return { ok: true, session };
}

/** Prefer the model's tool-call id so two calls in one step do not share a ledger row. */
function workspaceOrchestratorToolCallId(
  runId: string,
  toolName: WorkspaceOrchestratorToolName,
  modelToolCallId?: string,
) {
  return modelToolCallId?.trim() || `${runId}:${toolName}`;
}

/**
 * Execute one planned tool against a session rebuilt from the database plus the shared run state.
 * Tool failures are returned, not thrown, so the agent loop reports them to the model and moves
 * on to the next planned tool (typically a notification) instead of retrying side effects.
 */
export async function executeWorkspaceOrchestratorTool(
  input: WorkspaceOrchestratorRunInput & {
    planTools: WorkspaceOrchestratorToolName[];
    toolName: WorkspaceOrchestratorToolName;
    toolInput: unknown;
    toolCallId?: string;
    state: WorkspaceOrchestratorToolState;
  },
): Promise<WorkspaceOrchestratorToolOutcome> {
  const loaded = await loadWorkspaceOrchestratorToolSession(input);
  if (!loaded.ok) {
    return loaded;
  }

  const { session } = loaded;
  const tool = buildWorkspaceOrchestratorTools(session)[input.toolName];
  if (!tool?.execute) {
    return {
      ok: false,
      message: `tool_not_planned: ${input.toolName}`,
      state: readWorkspaceOrchestratorToolState(session),
    };
  }

  const validation = await asSchema(tool.inputSchema).validate?.(input.toolInput);
  if (validation && !validation.success) {
    return {
      ok: false,
      message: validation.error.message,
      state: readWorkspaceOrchestratorToolState(session),
    };
  }

  const toolCallId = workspaceOrchestratorToolCallId(
    input.workspaceAutomationRunId,
    input.toolName,
    input.toolCallId,
  );
  const guarded = !RETRY_SAFE_TOOLS.has(input.toolName);

  if (guarded) {
    const claim = await claimWorkspaceAutomationToolAttempt({
      runId: input.workspaceAutomationRunId,
      organizationId: input.organizationId,
      toolCallId,
      toolName: input.toolName,
    });

    if (claim.kind === "succeeded") {
      return {
        ok: true,
        output: claim.output.result,
        state: (claim.output.state as WorkspaceOrchestratorToolState) ?? input.state,
      };
    }
    if (claim.kind === "failed") {
      return {
        ok: false,
        message: claim.error,
        state: (claim.output?.state as WorkspaceOrchestratorToolState) ?? input.state,
      };
    }
    if (claim.kind === "in_doubt") {
      const message = `${input.toolName}_outcome_unknown`;
      session.stepResults[input.toolName] = {
        outcomeUnknown: true,
        message:
          "A previous attempt was interrupted before recording its outcome, so it was not repeated.",
      };
      logger.warn(
        { workspaceAutomationRunId: input.workspaceAutomationRunId, toolName: input.toolName },
        "workspace orchestrator tool not repeated after an interrupted attempt",
      );
      return { ok: false, message, state: readWorkspaceOrchestratorToolState(session) };
    }
  }

  try {
    const output = await tool.execute(validation ? validation.value : input.toolInput, {
      toolCallId,
      messages: [],
      context: {},
    });
    const state = readWorkspaceOrchestratorToolState(session);
    if (guarded) {
      await settleWorkspaceAutomationToolAttempt({
        runId: input.workspaceAutomationRunId,
        toolCallId,
        status: "succeeded",
        output: { result: output, state },
      });
    }
    return { ok: true, output, state };
  } catch (error) {
    const message = error instanceof Error ? error.message : `${input.toolName}_failed`;
    const state = readWorkspaceOrchestratorToolState(session);
    if (guarded) {
      await settleWorkspaceAutomationToolAttempt({
        runId: input.workspaceAutomationRunId,
        toolCallId,
        status: "failed",
        output: { state },
        error: message,
      });
    }
    return { ok: false, message, state };
  }
}

/** Record the terminal status and output summary, then bill the reserved agent run. */
export async function completeWorkspaceOrchestratorRun(
  input: WorkspaceOrchestratorRunInput & {
    planTools: WorkspaceOrchestratorToolName[];
    state: WorkspaceOrchestratorToolState;
    usage: unknown;
  },
): Promise<Result<WorkspaceOrchestratorExecutionSuccess, WorkspaceOrchestratorExecutionError>> {
  const context = await loadWorkspaceOrchestratorContext(input);
  if (!context.ok) {
    return context;
  }

  const { run, automation } = context.value;
  // Cancellation is decided outside the run loop; never overwrite it with the tools' outcome.
  const terminalStatus =
    run.status === "cancelled"
      ? "cancelled"
      : deriveTerminalStatus({
          terminalStatus: input.state.terminalStatus,
          plan: { tools: input.planTools },
        });

  await completeAgentRuntimeUsage({
    organizationId: input.organizationId,
    operationKey: usageOperationKey(run.id),
    dimensions: usageDimensions(automation.id),
    tokenUsage: extractAiSdkTokenUsage(input.usage),
  });

  await updateWorkspaceAutomationRun({
    runId: run.id,
    organizationId: input.organizationId,
    status: terminalStatus,
    outputSummary: buildWorkspaceOrchestratorOutputSummary(
      run.outputSummary,
      input.state.stepResults,
      { notificationWarnings: collectNotificationWarnings(input.state.stepResults) },
    ),
    error: input.state.terminalError ? { message: input.state.terminalError } : null,
    completedAt: new Date(),
  });

  logger.info(
    {
      workspaceAutomationRunId: run.id,
      organizationId: input.organizationId,
      planTools: input.planTools,
      terminalStatus,
      stepResults: input.state.stepResults,
      ...(input.state.terminalError ? { terminalError: input.state.terminalError } : {}),
    },
    "workspace orchestrator finished",
  );

  return ok({
    runId: run.id,
    status: terminalStatus,
    planTools: input.planTools,
    stepResults: input.state.stepResults,
  });
}

/** Mark the run failed. The usage reservation is left unbilled. */
export async function failWorkspaceOrchestratorRun(
  input: WorkspaceOrchestratorRunInput & {
    state: WorkspaceOrchestratorToolState;
    message: string;
  },
): Promise<WorkspaceOrchestratorExecutionError> {
  const run = await getWorkspaceAutomationRunById({
    runId: input.workspaceAutomationRunId,
    organizationId: input.organizationId,
  });

  if (run && run.status !== "cancelled") {
    await updateWorkspaceAutomationRun({
      runId: run.id,
      organizationId: input.organizationId,
      status: "failed",
      error: { message: input.message },
      outputSummary: buildWorkspaceOrchestratorOutputSummary(
        run.outputSummary,
        input.state.stepResults,
      ),
      completedAt: new Date(),
    });
  }

  return {
    code: "workspace_orchestrator_failed",
    message: input.message,
    runId: input.workspaceAutomationRunId,
  };
}
