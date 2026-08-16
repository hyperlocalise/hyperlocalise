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
import { gateway, isStepCount, ToolLoopAgent, type ToolSet } from "ai";
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
import type { WorkspaceAutomationWebSearchProvider } from "@/lib/agents/workspace-automations";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import type { WorkspaceOrchestratorSession } from "../context";
import { mergeToolOutputSummaryIntoSessionRun } from "../workspace-orchestrator-output-summary";

const WEB_SEARCH_TOOL_STEP_LIMIT = 8;

const useWebSearchInputSchema = z.object({
  objective: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .describe("What to search the live web for, including markets, competitors, or current facts."),
});

export function resolveWorkspaceWebSearchGatewayTools(
  provider: WorkspaceAutomationWebSearchProvider,
): ToolSet {
  switch (provider) {
    case "perplexity":
      return {
        perplexity_search: gateway.tools.perplexitySearch(),
      };
    case "exa":
      return {
        exa_search: gateway.tools.exaSearch(),
      };
    case "auto":
      return {
        perplexity_search: gateway.tools.perplexitySearch(),
        exa_search: gateway.tools.exaSearch(),
      };
    default:
      return assertNever(provider);
  }
}

function webSearchProviderInstructions(provider: WorkspaceAutomationWebSearchProvider): string {
  switch (provider) {
    case "perplexity":
      return "Use perplexity_search for current web results.";
    case "exa":
      return "Use exa_search for current web results and extracted excerpts.";
    case "auto":
      return [
        "Choose the search tool that fits the objective.",
        "Use perplexity_search for news, recency, language, or country filters.",
        "Use exa_search for domain filters, categories, or token-efficient excerpts.",
      ].join(" ");
    default:
      return assertNever(provider);
  }
}

export function createUseWebSearchTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Search the live web through Vercel AI Gateway. Supports Auto (Perplexity or Exa), Perplexity, or Exa.",
    inputSchema: useWebSearchInputSchema,
    execute: async ({ objective }) => {
      const webSearch = session.automation.toolConfig.webSearch;
      if (!webSearch?.enabled) {
        throw new Error("web_search_not_configured");
      }

      const provider = webSearch.provider;
      const tools = resolveWorkspaceWebSearchGatewayTools(provider);
      const toolNames = Object.keys(tools);

      const agent = new ToolLoopAgent({
        model: getHyperlocaliseAgentModel(),
        tools,
        instructions: [
          "You are gathering current web research for a workspace automation.",
          webSearchProviderInstructions(provider),
          "Cite titles and URLs for the sources you rely on.",
          "Return a concise factual summary with the key findings.",
          SUBAGENT_NO_QUESTIONS_RULES,
          SUBAGENT_RESPONSE_FORMAT,
        ].join("\n"),
        stopWhen: isStepCount(WEB_SEARCH_TOOL_STEP_LIMIT),
        timeout: WORKFLOW_AGENT_TIMEOUT,
      });

      const result = await withAgentRuntimeUsageMetering({
        organizationId: session.organizationId,
        operationKey: `workspace-web-search:${session.run.id}:agent_runs`,
        source: "workspace_web_search_agent",
        dimensions: {
          surface: "automation",
          agent_surface: "web_search",
          provider,
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

      const summary = result.text.trim() || "Completed web search with no textual summary.";
      const payload = {
        summary,
        provider,
        toolNames,
      };

      // Record only provider/status/count metadata in stepResults. The summary can echo
      // customer-identifying details from the search objective or automation instructions,
      // and run-workspace-orchestrator logs session.stepResults wholesale.
      session.stepResults.use_web_search = {
        provider,
        toolCount: toolNames.length,
        status: "completed",
      };
      mergeToolOutputSummaryIntoSessionRun(session, { webSearch: payload });
      return payload;
    },
  });
}
