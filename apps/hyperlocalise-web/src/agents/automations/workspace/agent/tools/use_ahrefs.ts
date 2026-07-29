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
import { isStepCount, ToolLoopAgent, type ToolSet } from "ai";
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { getHyperlocaliseAgentModel } from "@/lib/agent-runtime/loops/model";
import {
  SUBAGENT_NO_QUESTIONS_RULES,
  SUBAGENT_RESPONSE_FORMAT,
  WORKFLOW_AGENT_TIMEOUT,
} from "@/lib/agent-runtime/subagents/constants";
import {
  extractGenerateResultTokenUsage,
  withAgentRuntimeUsageMetering,
} from "@/lib/billing/agent-runtime-usage";
import { AHREFS_MCP_CONNECT_TIMEOUT_MS } from "@/lib/ahrefs/constants";
import { loadAhrefsConnectionWithApiKey } from "@/lib/ahrefs/connections";
import { createAhrefsMcpClient, listAhrefsMcpTools } from "@/lib/ahrefs/mcp-client";
import { isErr } from "@/lib/primitives/result/results";

import type { WorkspaceOrchestratorSession } from "../context";

const AHREFS_TOOL_STEP_LIMIT = 10;

const useAhrefsInputSchema = z.object({
  objective: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .describe(
      "What Ahrefs data to gather (keywords, backlinks, rankings, site audit, competitors, etc.).",
    ),
});

export function createUseAhrefsTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Query Ahrefs SEO data through the connected Ahrefs MCP server. Use available Ahrefs tools to gather keyword, backlink, ranking, and site metrics.",
    inputSchema: useAhrefsInputSchema,
    execute: async ({ objective }) => {
      const ahrefs = session.automation.toolConfig.ahrefs;
      if (!ahrefs?.enabled || !ahrefs.connectionId) {
        throw new Error("ahrefs_not_configured");
      }

      const connectionResult = await loadAhrefsConnectionWithApiKey({
        organizationId: session.organizationId,
        connectionId: ahrefs.connectionId,
      });
      if (isErr(connectionResult)) {
        throw new Error(connectionResult.error.code);
      }

      if (
        !connectionResult.value.connection.enabled ||
        connectionResult.value.connection.validationStatus !== "valid"
      ) {
        throw new Error("ahrefs_not_connected");
      }

      // Short-lived signal for connect + tool discovery only. Tool-call fetch
      // switches to the agent timeout after discovery so multi-call reports
      // are not cut off by the 30s connect budget.
      const connectSignal = AbortSignal.timeout(AHREFS_MCP_CONNECT_TIMEOUT_MS);
      let requestSignal = connectSignal;
      const clientResult = await createAhrefsMcpClient({
        apiKey: connectionResult.value.apiKey,
        signal: connectSignal,
        getRequestSignal: () => requestSignal,
      });
      if (isErr(clientResult)) {
        throw new Error(clientResult.error.code);
      }

      const mcpClient = clientResult.value;

      try {
        const toolsResult = await listAhrefsMcpTools({
          client: mcpClient,
          signal: connectSignal,
        });
        if (isErr(toolsResult)) {
          throw new Error(toolsResult.error.code);
        }
        const tools = toolsResult.value as ToolSet;
        const toolNames = Object.keys(tools);

        requestSignal = AbortSignal.timeout(WORKFLOW_AGENT_TIMEOUT.totalMs);

        const agent = new ToolLoopAgent({
          model: getHyperlocaliseAgentModel(),
          tools,
          instructions: [
            "You are gathering Ahrefs data for a workspace automation.",
            "Use Ahrefs MCP tools to fulfill the objective.",
            "Return a concise factual summary with the key metrics and findings.",
            SUBAGENT_NO_QUESTIONS_RULES,
            SUBAGENT_RESPONSE_FORMAT,
          ].join("\n"),
          stopWhen: isStepCount(AHREFS_TOOL_STEP_LIMIT),
          timeout: WORKFLOW_AGENT_TIMEOUT,
        });

        const result = await withAgentRuntimeUsageMetering({
          organizationId: session.organizationId,
          operationKey: `workspace-ahrefs:${session.run.id}:agent_runs`,
          source: "workspace_ahrefs_agent",
          dimensions: {
            surface: "automation",
            agent_surface: "ahrefs",
            connection_id: connectionResult.value.connection.id,
          },
          extractTokenUsage: extractGenerateResultTokenUsage,
          run: () =>
            agent.generate({
              messages: [
                {
                  role: "user",
                  content: [
                    `Objective: ${objective}`,
                    session.automation.instructions.trim()
                      ? `Automation instructions:\n${session.automation.instructions.trim()}`
                      : null,
                  ]
                    .filter((line): line is string => Boolean(line))
                    .join("\n\n"),
                },
              ],
            }),
        });

        const summary = result.text.trim() || "Completed Ahrefs research with no textual summary.";

        const payload = {
          summary,
          connectionId: connectionResult.value.connection.id,
          toolCount: toolNames.length,
        };
        session.stepResults.use_ahrefs = payload;
        return payload;
      } finally {
        await mcpClient.close().catch(() => undefined);
      }
    },
  });
}
