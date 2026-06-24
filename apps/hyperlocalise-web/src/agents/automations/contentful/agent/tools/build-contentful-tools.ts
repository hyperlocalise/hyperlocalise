import type { ToolSet } from "ai";
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { executeContentfulAutomation } from "@/lib/contentful/automation-executor";
import { ContentfulManagementClient } from "@/lib/contentful/client";
import { loadContentfulConnectionWithToken } from "@/lib/contentful/connections";

import type { ContentfulAgentSession } from "../context";

export const CONTENTFUL_TRANSLATION_EXECUTOR_TOOL_NAME = "run_translation";

export function buildContentfulAgentTools(session: ContentfulAgentSession): ToolSet {
  const tools = {} as ToolSet;

  tools[CONTENTFUL_TRANSLATION_EXECUTOR_TOOL_NAME] = defineAgentTool({
    description:
      "Run the Contentful translation pipeline: fetch the entry, detect translatable fields, translate into target locales, run QA when enabled, and write drafts back to Contentful.",
    inputSchema: z.object({}),
    execute: async () => {
      const result = await executeContentfulAutomation(
        {
          contentfulTranslationRunId: session.runId,
          workspaceAutomationRunId: session.workspaceAutomationRunId,
          organizationId: session.organizationId,
        },
        { manageWorkspaceRunStatus: false },
      );

      if (!result.ok) {
        session.executionError = result.error.message;
        throw new Error(result.error.message);
      }

      session.executionResult = result.value;
      return result.value;
    },
  });

  return tools;
}

export async function loadContentfulAgentClient(input: {
  organizationId: string;
  connectionId: string;
}) {
  const loaded = await loadContentfulConnectionWithToken(input);
  if (!loaded) {
    throw new Error("contentful_connection_not_found");
  }
  if (!loaded.connection.enabled) {
    throw new Error("contentful_connection_disabled");
  }

  const client = new ContentfulManagementClient({
    accessToken: loaded.token,
    spaceId: loaded.connection.spaceId,
    environmentId: loaded.connection.environmentId,
  });

  return { client, connection: loaded.connection };
}
