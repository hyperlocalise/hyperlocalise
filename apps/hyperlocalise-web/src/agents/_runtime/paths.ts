import { join } from "node:path";

export function getAgentsRoot(): string {
  return join(process.cwd(), "src/agents");
}

export function getAgentPackageRoot(agentId: string): string {
  return join(getAgentsRoot(), agentId, "agent");
}

export function getAutomationAgentRoot(automationId: string): string {
  return join(getAgentsRoot(), "automations", automationId, "agent");
}
