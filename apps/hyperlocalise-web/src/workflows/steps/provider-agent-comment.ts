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
export async function executeProviderAgentCommentStep(input: {
  agentRunId: string;
  organizationId: string;
}) {
  "use step";
  const { executeProviderAgentComment } =
    await import("@/lib/providers/agent-runs/provider-agent-comment");
  return executeProviderAgentComment(input);
}

export async function failProviderAgentCommentStep(input: {
  agentRunId: string;
  organizationId: string;
  code: string;
  message: string;
}) {
  "use step";
  const { failAgentRun } = await import("@/lib/providers/agent-runs/agent-runs");

  await failAgentRun({
    runId: input.agentRunId,
    organizationId: input.organizationId,
    outputSummary: { code: input.code },
    warnings: [input.message],
  });

  return {
    ok: false as const,
    agentRunId: input.agentRunId,
    code: input.code,
    message: input.message,
  };
}
