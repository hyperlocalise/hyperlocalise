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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { VisualNodeConfig, VisualWorkflowRfNode } from "@/lib/visual-workflows/schema/types";

import { VisualWorkflowEditor } from "./visual-workflow-editor";

const toastMocks = vi.hoisted(() => ({
  message: vi.fn(),
  dismiss: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMocks }));

vi.mock("./visual-workflow-canvas", () => ({
  VisualWorkflowCanvas: ({
    onSelectionChange,
    onLoadSample,
  }: {
    onSelectionChange: (params: { nodes: Array<{ id: string }>; edges: unknown[] }) => void;
    onLoadSample: () => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => onSelectionChange({ nodes: [{ id: "notify" }], edges: [] })}
      >
        Select notify
      </button>
      <button type="button" onClick={onLoadSample}>
        Load sample
      </button>
    </div>
  ),
}));

vi.mock("./visual-workflow-config-panel", () => ({
  VisualWorkflowConfigPanel: ({
    onChangeConfig,
    onBack,
  }: {
    node: VisualWorkflowRfNode;
    onChangeConfig: (config: VisualNodeConfig) => void;
    onBack: () => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onChangeConfig({
            kind: "action.notify_slack",
            channelId: "#ops",
            message: "Deployed",
            onError: "stop",
          })
        }
      >
        Change settings
      </button>
      <button type="button" onClick={onBack}>
        Back
      </button>
    </div>
  ),
}));

const draft = {
  name: "A step with an empty setting",
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
          channelId: "",
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

function renderEditor() {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <TooltipProvider>
        <VisualWorkflowEditor
          initialName={draft.name}
          initialNodes={draft.nodes}
          initialEdges={draft.edges}
          previewMode
          playgroundMode
        />
      </TooltipProvider>
    </IntlProvider>,
  );
}

async function undoHiddenSettingsChange() {
  const user = userEvent.setup();
  renderEditor();

  await user.click(screen.getByRole("button", { name: "Select notify" }));
  await user.click(screen.getByRole("button", { name: "Change settings" }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("button", { name: "Undo" }));

  expect(toastMocks.message).toHaveBeenLastCalledWith(
    "Undo changing a step's settings",
    expect.objectContaining({ id: "visual-workflow-undo" }),
  );
  return user;
}

describe("VisualWorkflowEditor undo notice", () => {
  afterEach(() => {
    toastMocks.message.mockReset();
    toastMocks.dismiss.mockReset();
  });

  it("dismisses the notice when a new step is recorded, not when only the selection changes", async () => {
    const user = await undoHiddenSettingsChange();
    toastMocks.dismiss.mockClear();

    await user.click(screen.getByRole("button", { name: "Select notify" }));
    expect(toastMocks.dismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();

    await user.type(screen.getByRole("textbox", { name: "Workflow name" }), "!");
    expect(toastMocks.dismiss).toHaveBeenCalledWith("visual-workflow-undo");
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("dismisses the notice when the history is reset", async () => {
    const user = await undoHiddenSettingsChange();
    toastMocks.dismiss.mockClear();

    await user.click(screen.getByRole("button", { name: "Load sample" }));
    expect(toastMocks.dismiss).toHaveBeenCalledWith("visual-workflow-undo");
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });
});
