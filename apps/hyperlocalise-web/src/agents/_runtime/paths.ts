import { join } from "node:path";

/** Glob relative to the Next.js app root; keep in sync with next.config outputFileTracingIncludes. */
export const AGENT_MARKDOWN_TRACE_GLOB = "src/agents/**/*.md";

export function getAgentsRoot(): string {
  return join(process.cwd(), "src/agents");
}

export function getAgentPackageRoot(agentId: string): string {
  return join(getAgentsRoot(), agentId, "agent");
}

export function getAutomationAgentRoot(automationId: string): string {
  return join(getAgentsRoot(), "automations", automationId, "agent");
}
