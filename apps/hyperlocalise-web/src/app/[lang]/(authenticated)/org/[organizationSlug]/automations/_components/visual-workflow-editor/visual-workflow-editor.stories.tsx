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

import {
  visualWorkflowDemoDraft,
  visualWorkflowPlaygroundDraft,
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
