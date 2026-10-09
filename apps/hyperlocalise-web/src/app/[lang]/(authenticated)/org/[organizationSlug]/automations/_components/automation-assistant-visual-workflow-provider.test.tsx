// @vitest-environment happy-dom
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
import type { UIMessage } from "ai";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { editVisualWorkflow } from "@/lib/agents/visual-workflow-assistant";
import type { VisualWorkflowEditorContext } from "@/lib/agents/visual-workflow-editor-context";
import { createDefaultConfig } from "@/lib/visual-workflows/catalog/node-catalog";
import type { VisualWorkflowGraph } from "@/lib/visual-workflows/editor/visual-workflow-undo";

import { useAutomationAssistant } from "./automation-assistant-session-provider";
import { AutomationAssistantVisualWorkflowProvider } from "./automation-assistant-visual-workflow-provider";

const api = vi.hoisted(() => ({
  createAssistantSession: vi.fn(),
  findAssistantSession: vi.fn(),
  loadAssistantSession: vi.fn(),
  deleteAssistantSession: vi.fn(),
  streamAssistantTurn: vi.fn(),
}));

vi.mock("./automation-assistant-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./automation-assistant-api")>();
  return { ...actual, ...api };
});

vi.mock("@/components/app-shell/store/app-shell-store-context", () => ({
  useOptionalAppShellStore: () => null,
}));

const session = {
  id: "sess-1",
  automationId: null,
  visualWorkflowId: "wf-1",
  title: "Automation assistant",
  turnInProgress: false,
  createdAt: "2026-10-10T00:00:00.000Z",
  lastMessageAt: "2026-10-10T00:00:00.000Z",
};

const start: VisualWorkflowGraph = {
  name: "Nightly sync",
  nodes: [
    {
      id: "trigger",
      type: "trigger.manual",
      position: { x: 0, y: 0 },
      data: {
        catalogType: "trigger.manual",
        config: createDefaultConfig("trigger.manual"),
        runStatus: "idle",
      },
    },
  ],
  edges: [],
};

/** A reply whose tool call added a Slack step after the trigger on the page the turn came from. */
function replyFor(context: VisualWorkflowEditorContext): UIMessage {
  const { output } = editVisualWorkflow(context, {
    operations: [
      {
        op: "add_node",
        id: "notify",
        type: "action.notify_slack",
        after: { nodeId: "trigger", handle: null },
        config: { message: "Sync finished" },
      },
    ],
  });
  return {
    id: "stream-1",
    role: "assistant",
    parts: [
      {
        type: "tool-edit_visual_workflow",
        state: "output-available",
        toolCallId: "call_1",
        input: {},
        output,
      },
      { type: "text", text: "I added a Notify Slack step after the trigger." },
    ],
  };
}

function Consumer() {
  const assistant = useAutomationAssistant();
  if (!assistant) {
    return <p>no assistant</p>;
  }
  return (
    <div>
      <p>{`mode:${assistant.mode} status:${assistant.status} calls:${assistant.appliedCallCount} changes:${assistant.appliedChangeCount} title:${assistant.automationName}`}</p>
      <button type="button" onClick={() => assistant.send("Notify Slack when it is done")}>
        Send
      </button>
    </div>
  );
}

function Harness() {
  const [graph, setGraph] = useState(start);
  return (
    <AutomationAssistantVisualWorkflowProvider
      organizationSlug="acme"
      visualWorkflowId="wf-1"
      graph={graph}
      onChange={setGraph}
    >
      <Consumer />
      <p>{`nodes:${graph.nodes.map((node) => node.id).join(",")} edges:${graph.edges.map((edge) => `${edge.source}>${edge.target}`).join(",")}`}</p>
    </AutomationAssistantVisualWorkflowProvider>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("AutomationAssistantVisualWorkflowProvider", () => {
  it("resumes the workflow's session, sends a message and lands the assistant's change on the canvas", async () => {
    const user = userEvent.setup();
    api.findAssistantSession.mockResolvedValue({ session: null, messages: [] });
    api.createAssistantSession.mockResolvedValue(session);
    api.streamAssistantTurn.mockImplementation(async function* (input: {
      pageContext: VisualWorkflowEditorContext;
    }) {
      expect(input.pageContext.kind).toBe("visual-workflow-editor");
      expect(input.pageContext.definition.nodes.map((node) => node.id)).toEqual(["trigger"]);
      yield replyFor(input.pageContext);
    });
    api.loadAssistantSession.mockResolvedValue({ session, messages: [] });
    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByText(/mode:visual_workflow status:idle/)).toBeTruthy();
    });
    expect(api.findAssistantSession).toHaveBeenCalledWith("acme", { visualWorkflowId: "wf-1" });

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText(/status:idle calls:1 changes:2 title:Nightly sync/)).toBeTruthy();
    });
    expect(screen.getByText("nodes:trigger,notify edges:trigger>notify")).toBeTruthy();
    expect(api.createAssistantSession).toHaveBeenCalledWith("acme", { visualWorkflowId: "wf-1" });
  });
});
