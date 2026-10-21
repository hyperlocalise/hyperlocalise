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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { TooltipProvider } from "@/components/ui/tooltip";

import { VisualWorkflowEditor } from "./visual-workflow-editor";

vi.mock("./visual-workflow-canvas", () => ({
  VisualWorkflowCanvas: ({
    onSelectionChange,
    onTestWorkflow,
  }: {
    onSelectionChange: (params: { nodes: Array<{ id: string }>; edges: unknown[] }) => void;
    onTestWorkflow: () => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => onSelectionChange({ nodes: [{ id: "notify" }], edges: [] })}
      >
        Select notify
      </button>
      <button type="button" onClick={onTestWorkflow}>
        Test workflow
      </button>
    </div>
  ),
}));

vi.mock("./visual-workflow-config-panel", () => ({
  VisualWorkflowConfigPanel: ({ onBack }: { onBack: () => void }) => (
    <div>
      <p>Step settings</p>
      <button type="button" onClick={onBack}>
        Back
      </button>
    </div>
  ),
}));

const draft = {
  name: "Weekly digest",
  nodes: [
    {
      id: "trigger",
      type: "trigger.manual" as const,
      position: { x: 80, y: 180 },
      data: {
        catalogType: "trigger.manual" as const,
        config: { kind: "trigger.manual" as const },
        runStatus: "idle" as const,
      },
    },
    {
      id: "notify",
      type: "action.notify_slack" as const,
      position: { x: 420, y: 180 },
      data: {
        catalogType: "action.notify_slack" as const,
        config: {
          kind: "action.notify_slack" as const,
          channelId: "#ops",
          message: "Deployed",
          onError: "stop" as const,
        },
        runStatus: "idle" as const,
      },
    },
  ],
  edges: [
    {
      id: "execution-edge",
      source: "trigger",
      target: "notify",
      sourceHandle: "success",
      targetHandle: "input",
      data: { kind: "execution" as const },
    },
  ],
};

function renderEditor(onSave = vi.fn()) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <TooltipProvider>
        <VisualWorkflowEditor
          initialName={draft.name}
          initialNodes={draft.nodes}
          initialEdges={draft.edges}
          onSave={onSave}
        />
      </TooltipProvider>
    </IntlProvider>,
  );
}

describe("VisualWorkflowEditor shortcuts", () => {
  it("saves with the keyboard and opens the shortcuts list", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderEditor(onSave);

    await user.keyboard("{Control>}s{/Control}");
    expect(onSave).toHaveBeenCalledOnce();

    await user.keyboard("?");
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByText("Fit the canvas")).toBeInTheDocument();
    expect(screen.queryByText("Configure with assistant")).not.toBeInTheDocument();
  });

  it("returns to the step picker with N after a step is selected", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Select notify" }));
    expect(screen.getByText("Step settings")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "What happens next?" })).not.toBeInTheDocument();

    await user.keyboard("n");
    expect(screen.getByRole("heading", { name: "What happens next?" })).toBeInTheDocument();
  });
});
