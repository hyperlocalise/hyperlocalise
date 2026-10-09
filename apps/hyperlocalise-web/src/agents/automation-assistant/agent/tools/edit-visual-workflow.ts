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
import {
  editVisualWorkflow,
  visualWorkflowEditInputSchema,
} from "@/lib/agents/visual-workflow-assistant";
import type { VisualWorkflowEditorContext } from "@/lib/agents/visual-workflow-editor-context";

/** What the tool reads and writes across the calls of one turn: the workflow as the turn knows it. */
export type VisualWorkflowAssistantToolContext = {
  visualWorkflowEditor: VisualWorkflowEditorContext;
};

export function createEditVisualWorkflowTool(ctx: VisualWorkflowAssistantToolContext) {
  return defineAgentTool({
    description:
      "Change the visual workflow the person has open on the canvas: add and remove nodes, connect and disconnect them, change a node's settings and input bindings, and rename the workflow. Pass every change of the request as one list of operations, in order; each is applied or refused on its own, and the result says which. It changes the canvas only: nothing is saved, and the person saves it themselves.",
    inputSchema: visualWorkflowEditInputSchema,
    execute: async (input) => {
      const { context, output } = editVisualWorkflow(ctx.visualWorkflowEditor, input);
      // A later call in the same turn starts from the workflow this one left.
      if (context) {
        ctx.visualWorkflowEditor = context;
      }
      return output;
    },
  });
}
