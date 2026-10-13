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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { toVisualWorkflowV3Definition } from "@/lib/visual-workflows/schema/serializers";

import {
  visualWorkflowDemoDraft,
  visualWorkflowPlaygroundDraft,
  visualWorkflowQuickAddDraft,
  visualWorkflowRetryDraft,
  visualWorkflowSwitchDeleteDraft,
  visualWorkflowWaitDraft,
  visualWorkflowMergeDraft,
  visualWorkflowSequenceDraft,
  visualWorkflowTerminalNodesDraft,
  visualWorkflowTryCatchDraft,
} from "./visual-workflow-editor.fixture";
import { VisualWorkflowEditor } from "./visual-workflow-editor";

const edgeKindsDraft = {
  name: "Execution and data edges",
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
      id: "request",
      type: "action.http" as const,
      position: { x: 420, y: 180 },
      data: {
        catalogType: "action.http" as const,
        config: {
          kind: "action.http" as const,
          method: "GET" as const,
          url: "https://example.com/api/items",
        },
        outputFields: [
          {
            path: "items",
            type: "array" as const,
          },
        ],
        runStatus: "idle" as const,
      },
    },
  ],
  edges: [
    {
      id: "execution-edge",
      source: "trigger",
      target: "request",
      sourceHandle: "success",
      targetHandle: "input",
      data: { kind: "execution" as const },
    },
    {
      id: "data-edge",
      source: "trigger",
      target: "request",
      sourceHandle: "triggeredAt",
      targetHandle: "url",
      data: { kind: "data" as const },
    },
  ],
};

const invalidStepDraft = {
  name: "A step with an empty setting",
  nodes: [
    edgeKindsDraft.nodes[0]!,
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

const meta = {
  title: "App/Automations/Visual Workflow",
  component: VisualWorkflowEditor,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Interactive playground for visual workflows. Add nodes from the picker, connect steps, configure each node, and run **Test workflow** to execute the graph in the browser. Logic nodes run for real; HTTP, Slack, and AI steps return simulated outputs.",
        story:
          "Shows execution and data ports with compatible-port highlighting. Invalid connections are rejected before they are committed to the graph.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="flex h-[100svh] flex-col">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof VisualWorkflowEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  name: "Playground",
  args: {
    initialName: visualWorkflowPlaygroundDraft.name,
    initialNodes: visualWorkflowPlaygroundDraft.nodes,
    initialEdges: visualWorkflowPlaygroundDraft.edges,
    previewMode: true,
    playgroundMode: true,
  },
};

export const SampleWorkflow: Story = {
  name: "Sample workflow",
  args: {
    initialName: visualWorkflowDemoDraft.name,
    initialNodes: visualWorkflowDemoDraft.nodes,
    initialEdges: visualWorkflowDemoDraft.edges,
    previewMode: true,
    playgroundMode: true,
  },
};

export const QuickAddBranches: Story = {
  name: "Quick-add Switch and For Each",
  args: {
    initialName: visualWorkflowQuickAddDraft.name,
    initialNodes: visualWorkflowQuickAddDraft.nodes,
    initialEdges: visualWorkflowQuickAddDraft.edges,
    previewMode: true,
    playgroundMode: true,
  },
  play: async ({ canvas }) => {
    const click = async (name: string | RegExp) => {
      const button = await canvas.findByRole("button", { name }, { timeout: 10_000 });
      button.click();
    };

    await click("Add node from Case 2");
    await click(/Assign values into the workflow context/);
    await expect(
      await canvas.findByTestId(/visual-workflow-edge-switch-.+-case-ready$/),
    ).toBeInTheDocument();
    await expect(canvas.queryByTestId("visual-workflow-validation-issues")).not.toBeInTheDocument();

    await click("Add node from Each item");
    await click(/Assign values into the workflow context/);
    await waitFor(async () => {
      await expect(canvas.getAllByTestId(/visual-workflow-edge-loop-.+-each$/)).toHaveLength(2);
    });
    await expect(canvas.queryByTestId("visual-workflow-validation-issues")).not.toBeInTheDocument();

    await click("Add node from Done");
    await click(/Assign values into the workflow context/);
    await expect(
      await canvas.findByTestId(/visual-workflow-edge-loop-.+-done$/),
    ).toBeInTheDocument();
    await expect(canvas.queryByTestId("visual-workflow-validation-issues")).not.toBeInTheDocument();
  },
};

export const SwitchCaseDelete: Story = {
  name: "Deleting a Switch case keeps other branches",
  args: {
    initialName: visualWorkflowSwitchDeleteDraft.name,
    initialNodes: visualWorkflowSwitchDeleteDraft.nodes,
    initialEdges: visualWorkflowSwitchDeleteDraft.edges,
    previewMode: true,
    playgroundMode: true,
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByTestId("visual-workflow-edge-switch-pending-case-pending"),
    ).toBeInTheDocument();
    await expect(
      await canvas.findByTestId("visual-workflow-edge-switch-ready-case-ready"),
    ).toBeInTheDocument();

    const switchTitle = await canvas.findByText("Switch", {}, { timeout: 10_000 });
    switchTitle.click();

    const removeFirst = await canvas.findByRole(
      "button",
      { name: "Remove case 1" },
      { timeout: 10_000 },
    );
    removeFirst.click();

    await expect(
      canvas.queryByTestId("visual-workflow-edge-switch-pending-case-pending"),
    ).not.toBeInTheDocument();
    await expect(
      await canvas.findByTestId("visual-workflow-edge-switch-ready-case-ready"),
    ).toBeInTheDocument();
    await expect(canvas.queryByTestId("visual-workflow-validation-issues")).not.toBeInTheDocument();
  },
};

export const PortCompatibility: Story = {
  name: "Port compatibility",
  parameters: {
    docs: {
      description: {
        story:
          "Shows execution and data ports with compatible-port highlighting. Invalid connections are rejected before they are committed to the graph.",
      },
    },
  },
  args: {
    initialName: edgeKindsDraft.name,
    initialNodes: edgeKindsDraft.nodes,
    initialEdges: edgeKindsDraft.edges,
    previewMode: true,
    playgroundMode: true,
  },
  play: async ({ canvas }) => {
    const executionInput = canvas.getAllByLabelText("Execution input");
    const dataOutput = canvas.getByLabelText("Data output: triggeredAt, string");
    const dataInput = canvas.getByLabelText("Data input: url, string");
    const optionalInput = canvas.getByLabelText("Data input: body, unknown, optional");
    const arrayInput = canvas.getByLabelText("Data output: items, array");

    await expect(executionInput).toHaveLength(1);
    await expect(canvas.getAllByLabelText("Execution success")).toHaveLength(2);

    await expect(dataOutput).toBeInTheDocument();
    await expect(dataInput).toBeInTheDocument();
    await expect(optionalInput).toBeInTheDocument();
    await expect(arrayInput).toBeInTheDocument();

    await expect(
      canvas.getByTestId("visual-workflow-edge-trigger-request-triggeredAt"),
    ).toBeInTheDocument();

    await expect(canvas.getByTitle("url: string")).toBeInTheDocument();
    await expect(canvas.getByTitle("body: unknown (optional)")).toBeInTheDocument();

    for (const type of ["string", "number", "boolean", "object", "array", "unknown"]) {
      await expect(canvas.getAllByText(type).length).toBeGreaterThan(0);
    }

    // A handle's glyph is hollow until a wire is attached, then filled.
    await expect(dataInput).toHaveAttribute("data-connected");
    await expect(dataOutput).toHaveAttribute("data-connected");
    await expect(optionalInput).not.toHaveAttribute("data-connected");
    await expect(dataInput.querySelector("svg")).toHaveAttribute("fill", "currentColor");
    await expect(optionalInput.querySelector("svg")).toHaveAttribute("fill", "var(--card)");
    await expect(executionInput[0]).toHaveAttribute("data-connected");

    await expect(dataInput.className).toContain("[&.connectingto.valid]:text-emerald-500");
    await expect(dataInput.querySelector("svg")?.getAttribute("class")).toContain(
      "group-[.connectingto]/handle:opacity-30",
    );

    // A port's dot takes its type's colour and sits on the card's edge, clear of the port's name.
    await expect(getComputedStyle(dataInput).color).not.toBe(getComputedStyle(optionalInput).color);
    const urlName = within(canvas.getByTitle("url: string")).getByText("url");
    await expect(dataInput.getBoundingClientRect().right).toBeLessThanOrEqual(
      urlName.getBoundingClientRect().left,
    );

    // An execution handle is an arrow, a data port a round dot.
    const executionIcon = executionInput[0]!.querySelector("svg");
    await expect(executionIcon).not.toBeNull();
    await expect(executionIcon!.innerHTML).not.toBe(dataInput.querySelector("svg")?.innerHTML);

    await expect(canvas.queryByTestId("visual-workflow-validation-issues")).not.toBeInTheDocument();

    const requestNode = canvas.getByTitle("url: string").closest(".react-flow__node");
    await expect(requestNode).not.toBeNull();
    await userEvent.click(requestNode!);

    await expect(await canvas.findByLabelText("URL")).toBeDisabled();
    await expect(
      canvas.getAllByText(
        "This value is supplied by a connected data port. Remove the data wire to edit it here.",
      ).length,
    ).toBeGreaterThan(0);
  },
};

export const LeaveStepSettings: Story = {
  name: "Leave a step's settings",
  parameters: {
    docs: {
      description: {
        story:
          "Back and the add button put a step's settings away and take the selection off the canvas, so a click on the same step opens its settings again.",
      },
    },
  },
  args: {
    initialName: edgeKindsDraft.name,
    initialNodes: edgeKindsDraft.nodes,
    initialEdges: edgeKindsDraft.edges,
    previewMode: true,
    playgroundMode: true,
  },
  play: async ({ canvas }) => {
    const requestNode = (await canvas.findByTitle("url: string", {}, { timeout: 10_000 })).closest(
      ".react-flow__node",
    );
    await expect(requestNode).not.toBeNull();
    const openSettings = async () => {
      await userEvent.click(within(requestNode as HTMLElement).getByText("HTTP Request"));
      await expect(await canvas.findByText("Find upstream fields")).toBeInTheDocument();
      await expect(requestNode).toHaveClass("selected");
    };
    const expectPicker = async () => {
      await expect(await canvas.findByText("What happens next?")).toBeInTheDocument();
      await waitFor(() => expect(requestNode).not.toHaveClass("selected"));
    };

    await openSettings();
    // The step is deleted from the same row that leads back to the picker.
    const back = canvas.getByRole("button", { name: "Back" });
    await expect(
      within(back.parentElement as HTMLElement).getByRole("button", { name: "Delete step" }),
    ).toHaveClass("text-destructive");

    await userEvent.click(back);
    await expectPicker();

    await openSettings();
    await userEvent.click(
      within(requestNode as HTMLElement).getByRole("button", { name: "Add node" }),
    );
    await expectPicker();

    await openSettings();
  },
};

export const UnsavedChanges: Story = {
  name: "Unsaved changes",
  parameters: {
    docs: {
      description: {
        story:
          "The editor reports whether its graph differs from the workflow as last saved. A change that is taken back, and a step that is only selected, leave nothing to save.",
      },
    },
  },
  args: {
    initialName: edgeKindsDraft.name,
    initialNodes: edgeKindsDraft.nodes,
    initialEdges: edgeKindsDraft.edges,
    savedDefinition: toVisualWorkflowV3Definition(edgeKindsDraft),
    onUnsavedChangesChange: fn(),
    previewMode: true,
    playgroundMode: true,
  },
  play: async ({ args, canvas }) => {
    const expectUnsaved = (unsaved: boolean) =>
      waitFor(() => expect(args.onUnsavedChangesChange).toHaveBeenLastCalledWith(unsaved));
    const name = await canvas.findByRole("textbox", { name: "Workflow name" });
    const requestNode = (await canvas.findByTitle("url: string", {}, { timeout: 10_000 })).closest(
      ".react-flow__node",
    );
    await expectUnsaved(false);

    await userEvent.type(name, "!");
    await expectUnsaved(true);
    await userEvent.type(name, "{Backspace}");
    await expectUnsaved(false);

    await userEvent.click(within(requestNode as HTMLElement).getByText("HTTP Request"));
    await expectUnsaved(false);
    await userEvent.click(await canvas.findByRole("combobox", { name: "Method" }));
    await userEvent.click(await within(document.body).findByRole("option", { name: "POST" }));
    await expectUnsaved(true);
  },
};

// The shadow that draws a step's band, as the browser writes it in a computed style.
function stepBandShadow(step: Element) {
  const band = step.querySelector('[data-slot="step-band"]');
  return band ? getComputedStyle(band).boxShadow : "";
}

// The colour of a step's band, as the browser writes it in a computed style.
function stepBandColour(step: Element, token: "--destructive" | "--ring") {
  const probe = document.createElement("span");
  probe.style.color = `color-mix(in srgb, var(${token}) 50%, transparent)`;
  step.appendChild(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

export const InvalidStep: Story = {
  name: "Invalid step",
  parameters: {
    docs: {
      description: {
        story:
          "A step with an empty required setting is marked on the canvas and gets a band in the destructive colour. The issue names the step and the setting, and its buttons select the step and bring it into view. Selected, the step shows the selection's band alone and keeps its mark. The band runs along the step's edge, under the handles.",
      },
    },
  },
  args: {
    initialName: invalidStepDraft.name,
    initialNodes: invalidStepDraft.nodes,
    initialEdges: invalidStepDraft.edges,
    previewMode: true,
    playgroundMode: true,
  },
  play: async ({ canvas }) => {
    const step = (await canvas.findByTitle("This step has a problem")).closest(
      '[data-slot="card"]',
    ) as HTMLElement;
    await expect(stepBandShadow(step)).toContain(stepBandColour(step, "--destructive"));
    await expect(canvas.getByText("channelId is required.")).toBeInTheDocument();
    // One broken step needs no arrows.
    await expect(canvas.queryByRole("button", { name: "Next issue" })).not.toBeInTheDocument();

    // Half of the band is inside the step's edge and half outside, so the handles sit on its
    // middle.
    const band = step.querySelector('[data-slot="step-band"]') as HTMLElement;
    await expect(getComputedStyle(band).top).toBe("1.5px");
    await expect(stepBandShadow(step)).toMatch(/ 0px 0px 0px 3px$/);

    await userEvent.click(canvas.getByRole("button", { name: "Show on canvas" }));

    await waitFor(() => expect(stepBandShadow(step)).toContain(stepBandColour(step, "--ring")));
    await expect(stepBandShadow(step)).not.toContain(stepBandColour(step, "--destructive"));
    await expect(canvas.getByTitle("This step has a problem")).toBeInTheDocument();

    await expect(await canvas.findByLabelText("Slack channel ID")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};

export const TypedDataPortsNarrow: Story = {
  name: "Typed data ports — narrow viewport",
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
    docs: {
      description: {
        story:
          "Verifies typed input and output ports remain readable and usable at a narrow viewport.",
      },
    },
  },
  args: {
    initialName: edgeKindsDraft.name,
    initialNodes: edgeKindsDraft.nodes,
    initialEdges: edgeKindsDraft.edges,
    previewMode: true,
    playgroundMode: true,
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByLabelText("Data output: triggeredAt, string", {}, { timeout: 10_000 }),
    ).toBeInTheDocument();

    await expect(canvas.getByLabelText("Data input: url, string")).toBeInTheDocument();

    await expect(canvas.getByLabelText("Data output: items, array")).toBeInTheDocument();
  },
};

export const RetryAttemptWiring: Story = {
  name: "Retry Attempt body",
  args: {
    initialName: visualWorkflowRetryDraft.name,
    initialNodes: visualWorkflowRetryDraft.nodes,
    initialEdges: visualWorkflowRetryDraft.edges,
    previewMode: true,
    playgroundMode: true,
  },
  play: async ({ canvas }) => {
    const click = async (name: string | RegExp) => {
      const button = await canvas.findByRole("button", { name }, { timeout: 10_000 });
      button.click();
    };

    await click("Add node from Succeeded");
    await click(/Assign values into the workflow context/);
    await expect(
      await canvas.findByTestId(/visual-workflow-edge-retry-.+-succeeded$/),
    ).toBeInTheDocument();
    await expect(canvas.queryByTestId("visual-workflow-validation-issues")).not.toBeInTheDocument();
  },
};

export const WaitBranches: Story = {
  name: "Wait duration and branches",
  parameters: {
    docs: {
      description: {
        story:
          "Shows a durable Wait node with Completed, Timed out, and Error execution branches, typed data ports, and duration configuration.",
      },
    },
  },
  args: {
    initialName: visualWorkflowWaitDraft.name,
    initialNodes: visualWorkflowWaitDraft.nodes,
    initialEdges: visualWorkflowWaitDraft.edges,
    previewMode: true,
    playgroundMode: true,
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByLabelText("Completed", {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    await expect(canvas.getByLabelText("Timed out")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Error")).toBeInTheDocument();

    await expect(
      canvas.getByLabelText("Data input: durationMs, number, optional"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByLabelText("Data input: timestamp, string, optional"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByLabelText("Data input: condition, unknown, optional"),
    ).toBeInTheDocument();

    await expect(canvas.getByLabelText("Data output: status, string")).toBeInTheDocument();
    await expect(
      canvas.getByLabelText("Data output: resumedAt, string, optional"),
    ).toBeInTheDocument();

    await expect(
      canvas.getByTestId("visual-workflow-edge-wait-completed-completed"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByTestId("visual-workflow-edge-wait-timed-out-timed_out"),
    ).toBeInTheDocument();
    await expect(canvas.getByTestId("visual-workflow-edge-wait-error-error")).toBeInTheDocument();

    await expect(canvas.queryByTestId("visual-workflow-validation-issues")).not.toBeInTheDocument();

    const waitNode = canvas
      .getByLabelText("Data input: durationMs, number, optional")
      .closest(".react-flow__node");

    await expect(waitNode).not.toBeNull();
    await userEvent.click(waitNode!);

    await expect(
      await canvas.findByRole("combobox", {
        name: "Wait mode",
      }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("textbox", {
        name: "Duration (ms)",
      }),
    ).toHaveValue("60000");
  },
};

export const MergeBranches: Story = {
  name: "Merge inputs and branches",
  parameters: {
    docs: {
      description: {
        story:
          "Shows stable named Merge inputs, optional aggregated values, and Completed, Timed out, and Error branches.",
      },
    },
  },
  args: {
    initialName: visualWorkflowMergeDraft.name,
    initialNodes: visualWorkflowMergeDraft.nodes,
    initialEdges: visualWorkflowMergeDraft.edges,
    previewMode: true,
    playgroundMode: true,
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByLabelText("Merge input: Email", {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    await expect(canvas.getByLabelText("Merge input: Slack")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Completed")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Timed out")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Error")).toBeInTheDocument();
    await expect(
      canvas.getByLabelText("Data input: value.email-input, unknown, optional"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByLabelText("Data input: value.slack-input, unknown, optional"),
    ).toBeInTheDocument();
    await expect(canvas.queryByTestId("visual-workflow-validation-issues")).not.toBeInTheDocument();

    const mergeNode = canvas.getByLabelText("Merge input: Email").closest(".react-flow__node");
    await expect(mergeNode).not.toBeNull();
    await userEvent.click(mergeNode!);
    await expect(await canvas.findByRole("combobox", { name: "Merge mode" })).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Merge input 1" })).toHaveValue("Email");
    await expect(canvas.getByRole("textbox", { name: "Merge input 2" })).toHaveValue("Slack");
    await expect(canvas.getByRole("textbox", { name: "Timeout (ms)" })).toHaveValue("60000");
  },
};

export const SequenceOutputs: Story = {
  name: "Sequence ordered outputs",
  parameters: {
    docs: {
      description: {
        story:
          "Shows a Sequence node with stable, user-configurable execution outputs dispatched in order.",
      },
    },
  },
  args: {
    initialName: visualWorkflowSequenceDraft.name,
    initialNodes: visualWorkflowSequenceDraft.nodes,
    initialEdges: visualWorkflowSequenceDraft.edges,
    previewMode: true,
    playgroundMode: true,
  },
  play: async ({ canvas }) => {
    const prepareHandle = await canvas.findByLabelText(
      "Sequence output: Prepare",
      {},
      { timeout: 10_000 },
    );
    await expect(prepareHandle).toBeInTheDocument();
    await expect(canvas.getByLabelText("Sequence output: Notify")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Sequence output: Audit")).toBeInTheDocument();
    await expect(canvas.queryByTestId("visual-workflow-validation-issues")).not.toBeInTheDocument();

    const sequenceNode = prepareHandle.closest(".react-flow__node");
    await expect(sequenceNode).not.toBeNull();
    await userEvent.click(sequenceNode!);

    await expect(await canvas.findByRole("textbox", { name: "Output 1" })).toHaveValue("Prepare");
    await expect(canvas.getByRole("textbox", { name: "Output 2" })).toHaveValue("Notify");
    await expect(canvas.getByRole("textbox", { name: "Output 3" })).toHaveValue("Audit");
    await expect(canvas.getByRole("button", { name: "Move output 2 up" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "Add output" })).toBeEnabled();
  },
};

export const TerminalNodes: Story = {
  name: "Stop, Return, and Fail",
  parameters: {
    docs: {
      description: {
        story: "Shows explicit successful, returned-data, and controlled-failure workflow endings.",
      },
    },
  },
  args: {
    initialName: visualWorkflowTerminalNodesDraft.name,
    initialNodes: visualWorkflowTerminalNodesDraft.nodes,
    initialEdges: visualWorkflowTerminalNodesDraft.edges,
    previewMode: true,
    playgroundMode: true,
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Stop workflow", {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    const returnTitle = canvas.getByText("Return outputs");
    await expect(returnTitle).toBeInTheDocument();
    await expect(canvas.getByText("Fail workflow")).toBeInTheDocument();

    const returnNode = returnTitle.closest(".react-flow__node");
    await expect(returnNode).not.toBeNull();
    await expect(returnNode!.querySelector('[aria-label="Execution input"]')).not.toBeNull();
    await expect(returnNode!.querySelector('[aria-label="Execution success"]')).toBeNull();
    await userEvent.click(returnNode!);

    await expect(await canvas.findByRole("textbox", { name: "Returned output 1" })).toHaveValue(
      "result",
    );
    await expect(
      canvas.getByRole("combobox", { name: "Returned output 1 type" }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add returned output" })).toBeEnabled();
  },
};

export const TryCatchNode: Story = {
  name: "Try / Catch focused node",
  parameters: {
    docs: {
      description: {
        story:
          "Focused error-boundary example showing every execution handle and typed error output.",
      },
    },
  },
  args: {
    initialName: visualWorkflowTryCatchDraft.name,
    initialNodes: visualWorkflowTryCatchDraft.nodes,
    initialEdges: visualWorkflowTryCatchDraft.edges,
    previewMode: true,
    playgroundMode: true,
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText("Try", {}, { timeout: 10_000 })).toBeInTheDocument();
    await expect(canvas.getByLabelText("Success")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Catch")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Finally")).toBeInTheDocument();
    await expect(
      canvas.getByLabelText("Data output: errorCode, string, optional"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByLabelText("Data output: errorMessage, string, optional"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByLabelText("Data output: failedNodeId, string, optional"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByLabelText("Data output: attempt, object, optional"),
    ).toBeInTheDocument();

    // Execution handles keep to the step's top part, so none shares a spot with a data port.
    const firstDataPort = canvas
      .getByLabelText("Data output: errorCode, string, optional")
      .getBoundingClientRect();
    for (const label of ["Try", "Success", "Catch", "Finally"]) {
      await expect(canvas.getByLabelText(label).getBoundingClientRect().bottom).toBeLessThan(
        firstDataPort.top,
      );
    }
    await expect(canvas.queryByTestId("visual-workflow-validation-issues")).not.toBeInTheDocument();
  },
};

export const TryCatchEditorNarrow: Story = {
  name: "Try / Catch editor — narrow viewport",
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  args: {
    initialName: visualWorkflowTryCatchDraft.name,
    initialNodes: visualWorkflowTryCatchDraft.nodes.map((node) =>
      node.id === "boundary"
        ? { ...node, data: { ...node.data, runStatus: "handled_error" as const } }
        : node,
    ),
    initialEdges: visualWorkflowTryCatchDraft.edges,
    previewMode: true,
    playgroundMode: true,
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Handled error", {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add node from Catch" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "Add node from Finally" })).toBeEnabled();
  },
};
