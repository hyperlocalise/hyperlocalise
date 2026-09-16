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
} from "./visual-workflow-editor.fixture";
import { VisualWorkflowEditor } from "./visual-workflow-editor";

const meta = {
  title: "App/Automations/Visual Workflow",
  component: VisualWorkflowEditor,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Interactive playground for visual workflows. Add nodes from the picker, connect steps, configure each node, and run **Test workflow** to execute the graph in the browser. Logic nodes run for real; HTTP, Slack, and AI steps return simulated outputs.",
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
      await canvas.findByTestId(/visual-workflow-edge-switch-.+-1$/),
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
