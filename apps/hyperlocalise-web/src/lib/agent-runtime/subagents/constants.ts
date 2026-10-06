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
/** Tool steps allowed inside a subagent loop. */
export const SUBAGENT_STEP_LIMIT = 200;

/** Steps for the parent orchestrator (delegate + synthesize). */
export const ORCHESTRATOR_STEP_LIMIT = 3;

const AGENT_STEP_TIMEOUT_MS = 60 * 1000;

export const DEFAULT_AGENT_TIMEOUT = {
  totalMs: 5 * 60 * 1000,
  stepMs: AGENT_STEP_TIMEOUT_MS,
} as const;

export const SUBAGENT_TIMEOUT = {
  totalMs: 10 * 60 * 1000,
  stepMs: AGENT_STEP_TIMEOUT_MS,
} as const;

export const ORCHESTRATOR_AGENT_TIMEOUT = {
  // The task tool blocks while subagents run, so reserve one subagent budget
  // for each non-final orchestrator step plus normal model step headroom.
  totalMs:
    (ORCHESTRATOR_STEP_LIMIT - 1) * SUBAGENT_TIMEOUT.totalMs +
    ORCHESTRATOR_STEP_LIMIT * AGENT_STEP_TIMEOUT_MS,
  stepMs: AGENT_STEP_TIMEOUT_MS,
} as const;

const WORKFLOW_AGENT_TOTAL_TIMEOUT_MS = 10 * 60 * 1000;
const WORKFLOW_AGENT_STEP_TIMEOUT_MS = 5 * 60 * 1000;

export const WORKFLOW_AGENT_TIMEOUT = {
  totalMs: WORKFLOW_AGENT_TOTAL_TIMEOUT_MS,
  // Hung model/tool round aborts before the nested agent burns its whole budget.
  stepMs: WORKFLOW_AGENT_STEP_TIMEOUT_MS,
} as const;

/**
 * Deadline budget per planned workspace automation tool. A planned tool can run a nested agent,
 * so it gets that agent's full budget plus the orchestrator model call that produces its input.
 */
export const WORKSPACE_ORCHESTRATOR_TOOL_BUDGET_MS =
  WORKFLOW_AGENT_TOTAL_TIMEOUT_MS + AGENT_STEP_TIMEOUT_MS;

/** Poll interval while waiting for a GitHub repository automation job to finish. */
export const WORKSPACE_GITHUB_JOB_POLL_INTERVAL_MS = 3_000;

/** Maximum time to wait for a GitHub repository automation job inside an orchestrator tool. */
export const WORKSPACE_GITHUB_JOB_POLL_MAX_MS = 20 * 60 * 1000;

/**
 * Durable workflow polling for GitHub repository automation jobs. Waiting happens in workflow
 * `sleep()` between short status steps, so it uses no function time and can outlast a step.
 */
export const WORKSPACE_GITHUB_JOB_DURABLE_POLL_INTERVAL_MS = 15_000;
export const WORKSPACE_GITHUB_JOB_DURABLE_POLL_MAX_MS = 60 * 60 * 1000;

/**
 * Durable repository agents (use_github_repository / use_gitlab_repository) run one workflow step
 * per model call and per repository tool call, so the whole review can run far longer than one
 * function invocation. The sandbox must outlive the agent deadline.
 */
export const REPOSITORY_AGENT_DURABLE_STEP_LIMIT = 60;
export const REPOSITORY_AGENT_DURABLE_TIMEOUT_MS = 45 * 60 * 1000;
export const REPOSITORY_AGENT_SANDBOX_TIMEOUT_MS =
  REPOSITORY_AGENT_DURABLE_TIMEOUT_MS + 10 * 60 * 1000;

/** Orchestrator deadline budget for planned tools that wait durably instead of inside one step. */
export const WORKSPACE_ORCHESTRATOR_DURABLE_TOOL_BUDGET_MS = {
  use_github_repository: REPOSITORY_AGENT_DURABLE_TIMEOUT_MS + 5 * AGENT_STEP_TIMEOUT_MS,
  use_gitlab_repository: REPOSITORY_AGENT_DURABLE_TIMEOUT_MS + 5 * AGENT_STEP_TIMEOUT_MS,
  run_github_workflows: WORKSPACE_GITHUB_JOB_DURABLE_POLL_MAX_MS + 5 * AGENT_STEP_TIMEOUT_MS,
} as const;

export const SUBAGENT_NO_QUESTIONS_RULES = [
  "You cannot ask follow-up questions — no one will respond in this loop.",
  "If required information is missing, state what is missing in your final summary.",
].join("\n");

export const SUBAGENT_RESPONSE_FORMAT = [
  "Return a concise final message the parent agent can relay to the user.",
  "Include concrete results (file paths, job IDs, locales) when tools return them.",
].join("\n");
