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
import {
  SUBAGENT_NO_QUESTIONS_RULES,
  SUBAGENT_RESPONSE_FORMAT,
  WORKFLOW_AGENT_TIMEOUT,
} from "@/lib/agent-runtime/subagents/constants";
import { resolveWorkspaceAutomationModel } from "@/lib/agents/workspace-automation-types";
import {
  extractGenerateResultTokenUsage,
  withAgentRuntimeUsageMetering,
} from "@/lib/billing/agent-runtime-usage";
import { isErr } from "@/lib/primitives/result/results";
import { createZernioAdsToolSet } from "@/lib/zernio/agent-tools";
import { loadZernioConnectionWithApiKey } from "@/lib/zernio/connections";

import type { WorkspaceOrchestratorSession } from "../context";

const ZERNIO_TOOL_STEP_LIMIT = 10;

const useZernioInputSchema = z.object({
  objective: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .describe(
      "What Zernio ads work to do (list accounts, inspect campaigns, create an ad or campaign).",
    ),
});

export function createUseZernioTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Create and manage paid ads through the connected Zernio API. List accounts, inspect the ads tree, and create ads or campaigns on Meta, Google, TikTok, LinkedIn, Pinterest, X, or OpenAI Ads.",
    inputSchema: useZernioInputSchema,
    execute: async ({ objective }) => {
      const zernio = session.automation.toolConfig.zernio;
      if (!zernio?.enabled || !zernio.connectionId) {
        throw new Error("zernio_not_configured");
      }

      const connectionResult = await loadZernioConnectionWithApiKey({
        organizationId: session.organizationId,
        connectionId: zernio.connectionId,
      });
      if (isErr(connectionResult)) {
        throw new Error(connectionResult.error.code);
      }

      if (
        !connectionResult.value.connection.enabled ||
        connectionResult.value.connection.validationStatus !== "valid"
      ) {
        throw new Error("zernio_not_connected");
      }

      const tools = createZernioAdsToolSet(connectionResult.value.apiKey) as ToolSet;
      const toolNames = Object.keys(tools);

      const agent = new ToolLoopAgent({
        model: resolveWorkspaceAutomationModel(session.automation.model),
        tools,
        instructions: [
          "You are creating or inspecting paid ads for a workspace automation through Zernio.",
          "List accounts first when you do not already have accountId and adAccountId.",
          "Prefer zernio_create_ad for a full campaign + ad set + ad. Use zernio_create_campaign only when the caller wants an empty campaign shell.",
          "Always send an idempotencyKey on create calls.",
          "Do not activate spend unless the objective asks for ACTIVE status. Default new ads to PAUSED when status is unspecified.",
          "Return a concise factual summary with ids, platforms, and status.",
          SUBAGENT_NO_QUESTIONS_RULES,
          SUBAGENT_RESPONSE_FORMAT,
        ].join("\n"),
        stopWhen: isStepCount(ZERNIO_TOOL_STEP_LIMIT),
        timeout: WORKFLOW_AGENT_TIMEOUT,
      });

      const result = await withAgentRuntimeUsageMetering({
        organizationId: session.organizationId,
        operationKey: `workspace-zernio:${session.run.id}:agent_runs`,
        source: "workspace_zernio_agent",
        dimensions: {
          surface: "automation",
          agent_surface: "zernio",
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

      const summary = result.text.trim() || "Completed Zernio ads work with no textual summary.";

      const payload = {
        summary,
        connectionId: connectionResult.value.connection.id,
        toolCount: toolNames.length,
      };
      session.stepResults.use_zernio = payload;
      return payload;
    },
  });
}
