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
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { VisualWorkflowTestSetup } from "@/lib/visual-workflows/editor/visual-workflow-test-data";
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
      <button
        type="button"
        onClick={() => onSelectionChange({ nodes: [{ id: "slack" }], edges: [] })}
      >
        Select slack
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
    onChangeTestRunsForReal,
    testRunsForReal,
    onChangeTestFailure,
    onDeleteNode,
    onBack,
    requestedTab,
  }: {
    node: VisualWorkflowRfNode;
    testData?: Record<string, unknown>;
    missingTestValues?: ReadonlyArray<{ path: string }>;
    onChangeTestData?: (value: Record<string, unknown>) => void;
    onChangeTestRunsForReal?: (real: boolean) => void;
    testRunsForReal?: boolean;
    onChangeTestFailure?: (failure: { message?: string } | undefined) => void;
    onDeleteNode?: () => void;
    onBack?: () => void;
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
      <p>Runs for real: {testRunsForReal ? "yes" : "no"}</p>
      {onChangeTestRunsForReal ? (
        <button type="button" onClick={() => onChangeTestRunsForReal(true)}>
          Run for real
        </button>
      ) : null}
      <button type="button" onClick={() => onChangeTestFailure?.({ message: "Down" })}>
        Set to fail
      </button>
      <button type="button" onClick={onDeleteNode}>
        Delete step
      </button>
      <button type="button" onClick={onBack}>
        Back
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

const nodesWithSlack = [
  ...nodes,
  step("slack", "action.notify_slack", {
    kind: "action.notify_slack",
    channelId: "C1",
    message: "Got {{ nodes.http.body }}",
  } as VisualWorkflowRfNode["data"]["config"]),
];

const edgesWithSlack = [
  { id: "e", source: "trigger", target: "http", data: { kind: "execution" as const } },
  { id: "f", source: "http", target: "slack", data: { kind: "execution" as const } },
];

function createApi() {
  return {
    createVisualWorkflowRun: vi.fn(async () => ({
      run: { id: "run-1", status: "succeeded", nodeRuns: [] },
      dispatch: { runId: "run-1", enqueued: true },
    })),
    getVisualWorkflowRun: vi.fn(),
  };
}

function renderServerEditor(
  api: ReturnType<typeof createApi>,
  options: {
    onSave?: (definition: unknown, testSetup: VisualWorkflowTestSetup) => void;
    initialTestSetup?: VisualWorkflowTestSetup;
  } = {},
) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <TooltipProvider>
        <VisualWorkflowEditor
          initialName="Test data"
          initialNodes={nodesWithSlack}
          initialEdges={edgesWithSlack}
          organizationSlug="acme"
          visualWorkflowId="wf-1"
          visualWorkflowsApi={api as never}
          onSave={options.onSave}
          initialTestSetup={options.initialTestSetup}
        />
      </TooltipProvider>
    </IntlProvider>,
  );
}

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

  it("asks before a test run in which a step runs for real, naming the test data it reads", async () => {
    const user = userEvent.setup();
    const api = createApi();
    renderServerEditor(api);

    await user.click(screen.getByRole("button", { name: "Select trigger" }));
    await user.click(screen.getByRole("button", { name: "Set test data" }));
    await user.click(screen.getByRole("button", { name: "Select http" }));
    await user.click(screen.getByRole("button", { name: "Set test data" }));
    await user.click(screen.getByRole("button", { name: "Select slack" }));
    await user.click(screen.getByRole("button", { name: "Run for real" }));
    expect(screen.getByText("Runs for real: yes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Test workflow" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Run 1 step for real?")).toBeInTheDocument();
    expect(within(dialog).getByText("slack")).toBeInTheDocument();
    expect(within(dialog).getByText(/^Uses test data from /)).toBeInTheDocument();
    expect(api.createVisualWorkflowRun).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Run test" }));
    expect(api.createVisualWorkflowRun).toHaveBeenCalledWith(
      "acme",
      "wf-1",
      expect.objectContaining({
        mode: "mock",
        realNodeIds: ["slack"],
        mockOutputs: expect.not.objectContaining({ slack: expect.anything() }),
        mockFailures: {},
      }),
    );
  });

  it("sends a mocked step's failure, and needs no test data for it", async () => {
    const user = userEvent.setup();
    const api = createApi();
    renderServerEditor(api, {
      initialTestSetup: {
        data: {
          trigger: { projectId: "p1", sourceFileId: "f1" },
          slack: { sent: true, channelId: "C1" },
        },
        realNodeIds: [],
        failures: {},
      },
    });

    await user.click(screen.getByRole("button", { name: "Select http" }));
    await user.click(screen.getByRole("button", { name: "Set to fail" }));
    await user.click(screen.getByRole("button", { name: "Test workflow" }));

    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(api.createVisualWorkflowRun).toHaveBeenCalledWith(
      "acme",
      "wf-1",
      expect.objectContaining({
        mode: "mock",
        realNodeIds: [],
        mockFailures: { http: { message: "Down" } },
      }),
    );
  });

  it("saves the test setup with the draft", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderServerEditor(createApi(), { onSave });

    await user.click(screen.getByRole("button", { name: "Select slack" }));
    await user.click(screen.getByRole("button", { name: "Run for real" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Test data" }), {
      data: {},
      realNodeIds: ["slack"],
      failures: {},
    });
  });

  it("gives a step added after one was deleted a new id, so it takes none of its test setup", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderServerEditor(createApi(), { onSave });

    await user.click(screen.getByRole("button", { name: "Select http" }));
    await user.click(screen.getByRole("button", { name: "Set to fail" }));
    await user.click(screen.getByRole("button", { name: "Delete step" }));
    await user.click(await screen.findByRole("button", { name: /HTTP Request/ }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const [definition, testSetup] = onSave.mock.lastCall as [
      { nodes: Array<{ id: string; type: string }> },
      unknown,
    ];
    expect(definition.nodes.filter((node) => node.type === "action.http")).toEqual([
      expect.objectContaining({ id: "http_2" }),
    ]);
    expect(testSetup).toEqual({ data: {}, realNodeIds: [], failures: {} });
  });
});
