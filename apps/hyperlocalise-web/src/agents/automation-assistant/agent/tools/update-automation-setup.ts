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
import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { updateWorkspaceAutomationSetup } from "@/lib/agents/workspace-automation-assistant";
import type { WorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import { workspaceAutomationProposalInputSchema } from "@/lib/agents/workspace-automation-proposal";

/** What the tool reads and writes across the calls of one turn: the page as the turn knows it. */
export type AutomationAssistantToolContext = {
  automationEditor: WorkspaceAutomationEditorContext;
};

export function createUpdateAutomationSetupTool(ctx: AutomationAssistantToolContext) {
  return defineAgentTool({
    description:
      "Fill in or change the automation page the person has open: its name, when it runs, the skills it uses and extra instructions. Pass everything that should change in one call and null for what should stay. The result says what was changed on the page, which skills were left out and why, and what the person still has to fill in. It changes the page only: nothing is saved, and the person saves it themselves.",
    inputSchema: workspaceAutomationProposalInputSchema,
    execute: async (input) => {
      const { context, output } = updateWorkspaceAutomationSetup(ctx.automationEditor, input);
      // A later call in the same turn starts from the form this one left.
      if (context) {
        ctx.automationEditor = context;
      }
      return output;
    },
  });
}
