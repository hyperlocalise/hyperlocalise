/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { getWorkflowMetadata } from "workflow";

import type { ProviderAgentCommentEventData } from "@/lib/workflow/types";

import {
  executeProviderAgentCommentStep,
  failProviderAgentCommentStep,
} from "./steps/provider-agent-comment";

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : "provider agent comment failed";
}

export async function providerAgentCommentWorkflow(event: ProviderAgentCommentEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  try {
    const result = await executeProviderAgentCommentStep(event);

    return {
      ...result,
      workflowRunId,
    };
  } catch (error) {
    const failure = await failProviderAgentCommentStep({
      agentRunId: event.agentRunId,
      organizationId: event.organizationId,
      code: "provider_agent_comment_failed",
      message: formatExecutionError(error),
    });

    return {
      ...failure,
      workflowRunId,
    };
  }
}
