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

export const WORKFLOW_AGENT_TIMEOUT = {
  totalMs: 10 * 60 * 1000,
  stepMs: 90 * 1000,
} as const;

/** Maximum tool steps for workspace automation orchestrator (workflows + notifications + summary). */
export const WORKSPACE_ORCHESTRATOR_STEP_LIMIT = 6;

export const WORKSPACE_ORCHESTRATOR_TIMEOUT = {
  totalMs: 25 * 60 * 1000,
  stepMs: 90 * 1000,
} as const;

/** Poll interval while waiting for a GitHub repository automation job to finish. */
export const WORKSPACE_GITHUB_JOB_POLL_INTERVAL_MS = 3_000;

/** Maximum time to wait for a GitHub repository automation job inside an orchestrator tool. */
export const WORKSPACE_GITHUB_JOB_POLL_MAX_MS = 20 * 60 * 1000;

export const SUBAGENT_NO_QUESTIONS_RULES = [
  "You cannot ask follow-up questions — no one will respond in this loop.",
  "If required information is missing, state what is missing in your final summary.",
].join("\n");

export const SUBAGENT_RESPONSE_FORMAT = [
  "Return a concise final message the parent agent can relay to the user.",
  "Include concrete results (file paths, job IDs, locales) when tools return them.",
].join("\n");
