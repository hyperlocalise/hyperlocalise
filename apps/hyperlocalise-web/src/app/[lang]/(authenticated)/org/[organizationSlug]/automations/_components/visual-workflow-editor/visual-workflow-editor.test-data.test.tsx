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
import type { VisualWorkflowRfNode } from "@/lib/visual-workflows/schema/types";

import type { StepSettingsTab } from "./visual-workflow-config-panel";
import { VisualWorkflowEditor } from "./visual-workflow-editor";

const mocks = vi.hoisted(() => ({
  toast: { message: vi.fn(), dismiss: vi.fn(), error: vi.fn(), success: vi.fn() },
  runPlaygroundWorkflow: vi.fn(async () => "succeeded"),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/visual-workflows/preview/playground-run", () => ({
  runPlaygroundWorkflow: mocks.runPlaygroundWorkflow,
}));

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
        onClick={() => onSelectionChange({ nodes: [{ id: "trigger" }], edges: [] })}
      >
        Select trigger
      </button>
      <button
        type="button"
        onClick={() => onSelectionChange({ nodes: [{ id: "http" }], edges: [] })}
      >
        Select http
      </button>
      <button type="button" onClick={onTestWorkflow}>
        Test workflow
      </button>
    </div>
  ),
}));

vi.mock("./visual-workflow-config-panel", () => ({
  VisualWorkflowConfigPanel: ({
    node,
    testData,
    missingTestValues,
    onChangeTestData,
    requestedTab,
  }: {
    node: VisualWorkflowRfNode;
    testData?: Record<string, unknown>;
    missingTestValues?: ReadonlyArray<{ path: string }>;
    onChangeTestData?: (value: Record<string, unknown>) => void;
    requestedTab?: { tab: StepSettingsTab };
  }) => (
    <div>
      <p>Settings of {node.id}</p>
      <p>Requested tab: {requestedTab?.tab ?? "none"}</p>
      <p>Missing: {(missingTestValues ?? []).map((entry) => entry.path).join(", ")}</p>
      <p>Test data: {JSON.stringify(testData ?? null)}</p>
      <button
        type="button"
        onClick={() =>
          onChangeTestData?.(
            node.id === "trigger"
              ? { projectId: "p1", sourceFileId: "f1" }
              : { status: 200, ok: true, headers: {}, body: "ok" },
          )
        }
      >
        Set test data
      </button>
    </div>
  ),
}));

function step(
  id: string,
  type: VisualWorkflowRfNode["data"]["catalogType"],
  config: VisualWorkflowRfNode["data"]["config"],
): VisualWorkflowRfNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { catalogType: type, config, runStatus: "idle" },
  };
}

const nodes = [
  step("trigger", "trigger.source_upload", { kind: "trigger.source_upload" }),
  step("http", "action.http", {
    kind: "action.http",
    method: "GET",
    url: "https://example.com",
    headers: [],
    queryParams: [],
    onError: "stop",
  } as VisualWorkflowRfNode["data"]["config"]),
];

function renderEditor() {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <TooltipProvider>
        <VisualWorkflowEditor
          initialName="Test data"
          initialNodes={nodes}
          initialEdges={[
            { id: "e", source: "trigger", target: "http", data: { kind: "execution" } },
          ]}
          previewMode
          playgroundMode
        />
      </TooltipProvider>
    </IntlProvider>,
  );
}

describe("VisualWorkflowEditor test data", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not start a test run while a value it needs is missing, and says where to set it", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Test workflow" }));

    expect(mocks.runPlaygroundWorkflow).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "6 test values are missing",
      expect.objectContaining({
        description: "Set projectId on the Test tab of Source upload.",
        action: expect.objectContaining({ label: "Show" }),
      }),
    );

    const [, options] = mocks.toast.error.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ];
    options.action.onClick();
    expect(await screen.findByText("Settings of trigger")).toBeInTheDocument();
    expect(screen.getByText("Requested tab: test")).toBeInTheDocument();
    expect(screen.getByText("Missing: projectId, sourceFileId")).toBeInTheDocument();
  });

  it("runs with exactly the test data set on each step", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Select trigger" }));
    await user.click(screen.getByRole("button", { name: "Set test data" }));
    await user.click(screen.getByRole("button", { name: "Select http" }));
    await user.click(screen.getByRole("button", { name: "Set test data" }));
    expect(screen.getByText("Missing:")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Test workflow" }));

    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(mocks.runPlaygroundWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerInput: { projectId: "p1", sourceFileId: "f1" },
        mockOutputs: { trigger: {}, http: { status: 200, ok: true, headers: {}, body: "ok" } },
      }),
    );
  });
});
