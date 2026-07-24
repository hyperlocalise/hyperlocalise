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
import { isErr } from "@/lib/primitives/result/results";
import { SEMRUSH_MCP_CONNECT_TIMEOUT_MS } from "@/lib/semrush/constants";
import { loadSemrushConnectionWithApiKey } from "@/lib/semrush/connections";
import { createSemrushMcpClient, listSemrushMcpTools } from "@/lib/semrush/mcp-client";

import type { WorkspaceOrchestratorSession } from "../context";

const SEMRUSH_TOOL_STEP_LIMIT = 10;

const useSemrushInputSchema = z.object({
  objective: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .describe(
      "What Semrush data to gather (keywords, competitors, backlinks, traffic, projects, etc.).",
    ),
});

export function createUseSemrushTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Query Semrush SEO, traffic, and project data through the connected Semrush MCP server. Use discovery tools, get_report_schema, and execute_report as needed.",
    inputSchema: useSemrushInputSchema,
    execute: async ({ objective }) => {
      const semrush = session.automation.toolConfig.semrush;
      if (!semrush?.enabled || !semrush.connectionId) {
        throw new Error("semrush_not_configured");
      }

      const connectionResult = await loadSemrushConnectionWithApiKey({
        organizationId: session.organizationId,
        connectionId: semrush.connectionId,
      });
      if (isErr(connectionResult)) {
        throw new Error(connectionResult.error.code);
      }

      if (
        !connectionResult.value.connection.enabled ||
        connectionResult.value.connection.validationStatus !== "valid"
      ) {
        throw new Error("semrush_not_connected");
      }

      // Short-lived signal for connect + tool discovery only. Tool-call fetch
      // switches to the agent timeout after discovery so multi-call reports
      // are not cut off by the 30s connect budget.
      const connectSignal = AbortSignal.timeout(SEMRUSH_MCP_CONNECT_TIMEOUT_MS);
      let requestSignal = connectSignal;
      const clientResult = await createSemrushMcpClient({
        apiKey: connectionResult.value.apiKey,
        signal: connectSignal,
        getRequestSignal: () => requestSignal,
      });
      if (isErr(clientResult)) {
        throw new Error(clientResult.error.code);
      }

      const mcpClient = clientResult.value;

      try {
        const toolsResult = await listSemrushMcpTools({
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
            "You are gathering Semrush data for a workspace automation.",
            "Use Semrush MCP tools to fulfill the objective.",
            "Prefer discovery tools, then get_report_schema, then execute_report.",
            "Return a concise factual summary with the key metrics and findings.",
            SUBAGENT_NO_QUESTIONS_RULES,
            SUBAGENT_RESPONSE_FORMAT,
          ].join("\n"),
          stopWhen: isStepCount(SEMRUSH_TOOL_STEP_LIMIT),
          timeout: WORKFLOW_AGENT_TIMEOUT,
        });

        const result = await withAgentRuntimeUsageMetering({
          organizationId: session.organizationId,
          operationKey: `workspace-semrush:${session.run.id}:agent_runs`,
          source: "workspace_semrush_agent",
          dimensions: {
            surface: "automation",
            agent_surface: "semrush",
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

        const summary = result.text.trim() || "Completed Semrush research with no textual summary.";

        const payload = {
          summary,
          connectionId: connectionResult.value.connection.id,
          toolCount: toolNames.length,
        };
        session.stepResults.use_semrush = payload;
        return payload;
      } finally {
        await mcpClient.close().catch(() => undefined);
      }
    },
  });
}
