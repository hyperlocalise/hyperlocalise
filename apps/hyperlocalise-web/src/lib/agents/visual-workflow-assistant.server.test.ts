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
import { describe, expect, it, vi } from "vite-plus/test";

import { toVisualWorkflowV3Definition } from "@/lib/visual-workflows/schema/serializers";

import { editVisualWorkflow } from "./visual-workflow-assistant";
import { buildVisualWorkflowEditorContext } from "./visual-workflow-editor-context";

// On the server `@xyflow/react` is a client module: none of its functions can be called there.
vi.mock("@xyflow/react", () => ({}));

describe("editVisualWorkflow on the server", () => {
  it("adds and connects steps without React Flow's client functions", () => {
    const context = buildVisualWorkflowEditorContext({
      editorSessionId: "editor-1",
      visualWorkflowId: "workflow-1",
      definition: toVisualWorkflowV3Definition({
        name: "Nightly sync",
        nodes: [
          {
            id: "trigger",
            type: "trigger.manual",
            position: { x: 0, y: 0 },
            data: {
              catalogType: "trigger.manual",
              config: { kind: "trigger.manual" },
              runStatus: "idle",
            },
          },
        ],
        edges: [],
      }),
    });

    const { output } = editVisualWorkflow(context, {
      operations: [
        {
          op: "add_node",
          id: "agent",
          type: "ai.agent",
          after: { nodeId: "trigger", handle: null },
        },
        {
          op: "add_node",
          id: "notify_slack",
          type: "action.notify_slack",
          after: { nodeId: "agent", handle: null },
          config: { message: "{{ nodes.agent.text }}" },
        },
      ],
    });

    expect(output.applied && output.result.applied).toHaveLength(2);
    expect(output.applied && output.result.rejected).toEqual([]);
  });
});
