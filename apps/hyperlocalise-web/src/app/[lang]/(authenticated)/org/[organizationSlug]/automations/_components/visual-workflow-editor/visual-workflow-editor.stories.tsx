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
import { expect, waitFor } from "storybook/test";

import {
  visualWorkflowDemoDraft,
  visualWorkflowPlaygroundDraft,
  visualWorkflowQuickAddDraft,
  visualWorkflowRetryDraft,
  visualWorkflowSwitchDeleteDraft,
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
        config: { kind: "action.http" as const, method: "GET" as const, url: "" },
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
    const executionInput = canvas.getByLabelText("Execution input");
    const dataOutput = canvas.getByLabelText("Data output: triggeredAt");
    const dataInput = canvas.getByLabelText("Data input: url");

    await expect(executionInput).toBeInTheDocument();
    await expect(canvas.getAllByLabelText("Execution success")).toHaveLength(2);
    await expect(dataOutput).toBeInTheDocument();
    await expect(dataInput).toBeInTheDocument();
    await expect(canvas.getByText("triggeredAt → url")).toBeInTheDocument();

    await expect(dataOutput).toHaveAttribute("title", "triggeredAt");
    await expect(dataInput).toHaveAttribute("title", "url");

    await expect(dataInput.className).toContain("[&.connecting.valid]:bg-emerald-500");
    await expect(dataInput.className).toContain("[&.connecting]:opacity-30");
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
