/** Tool steps allowed inside a specialist subagent loop. */
export const SUBAGENT_STEP_LIMIT = 5;

/** Steps for the parent orchestrator (delegate + synthesize). */
export const ORCHESTRATOR_STEP_LIMIT = 3;

export const SUBAGENT_NO_QUESTIONS_RULES = [
  "You cannot ask follow-up questions — no one will respond in this loop.",
  "If required information is missing, state what is missing in your final summary.",
].join("\n");

export const SUBAGENT_RESPONSE_FORMAT = [
  "Return a concise final message the parent agent can relay to the user.",
  "Include concrete results (file paths, job IDs, locales) when tools return them.",
].join("\n");
