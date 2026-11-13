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
import type {
  WorkflowAgentOnEndCallback,
  WorkflowAgentOnStartCallback,
  WorkflowAgentOnStepEndCallback,
  WorkflowAgentOnStepStartCallback,
  WorkflowAgentOnToolExecutionEndCallback,
  WorkflowAgentOnToolExecutionStartCallback,
} from "@ai-sdk/workflow";
import type { LanguageModelUsage } from "ai";

const LOG_PREFIX = "[workspace-automation-agent]";

/** Identifies which agent loop a log line belongs to. */
export type WorkflowAgentLogContext = {
  agent: "workspace_orchestrator" | "use_github_repository" | "use_gitlab_repository";
  workspaceAutomationRunId: string;
  organizationId: string;
  workflowRunId: string;
};

export type WorkflowAgentLogCallbacks = {
  onStart: WorkflowAgentOnStartCallback;
  onStepStart: WorkflowAgentOnStepStartCallback;
  onToolExecutionStart: WorkflowAgentOnToolExecutionStartCallback;
  onToolExecutionEnd: WorkflowAgentOnToolExecutionEndCallback;
  onStepEnd: WorkflowAgentOnStepEndCallback;
  onEnd: WorkflowAgentOnEndCallback;
};

function tokenCounts(usage: LanguageModelUsage | undefined) {
  return {
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Lifecycle logging for a WorkflowAgent loop. These callbacks run in the workflow function, which
 * cannot load the server logger, so they write structured console lines like the other workflows.
 * Only ids, counts, timings, and finish reasons are logged: prompts, tool inputs, and tool outputs
 * can carry customer content.
 */
export function workflowAgentLogCallbacks(
  context: WorkflowAgentLogContext,
): WorkflowAgentLogCallbacks {
  return {
    onStart: ({ messages }) => {
      console.info(`${LOG_PREFIX} agent started`, { ...context, messageCount: messages.length });
    },
    onStepStart: ({ stepNumber }) => {
      console.info(`${LOG_PREFIX} step started`, { ...context, stepNumber });
    },
    onToolExecutionStart: ({ toolCall, stepNumber }) => {
      console.info(`${LOG_PREFIX} tool started`, {
        ...context,
        stepNumber,
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
      });
    },
    onToolExecutionEnd: (event) => {
      const fields = {
        ...context,
        stepNumber: event.stepNumber,
        toolName: event.toolCall.toolName,
        toolCallId: event.toolCall.toolCallId,
        durationMs: event.durationMs,
      };
      if (event.success) {
        console.info(`${LOG_PREFIX} tool finished`, fields);
      } else {
        console.warn(`${LOG_PREFIX} tool failed`, { ...fields, error: errorMessage(event.error) });
      }
    },
    onStepEnd: ({ stepNumber, finishReason, usage, toolCalls }) => {
      console.info(`${LOG_PREFIX} step finished`, {
        ...context,
        stepNumber,
        finishReason,
        toolCalls: toolCalls.map((call) => call.toolName),
        ...tokenCounts(usage),
      });
    },
    onEnd: ({ steps, finishReason, totalUsage }) => {
      console.info(`${LOG_PREFIX} agent finished`, {
        ...context,
        stepCount: steps.length,
        finishReason,
        ...tokenCounts(totalUsage),
      });
    },
  };
}
