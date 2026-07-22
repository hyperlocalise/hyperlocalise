/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
