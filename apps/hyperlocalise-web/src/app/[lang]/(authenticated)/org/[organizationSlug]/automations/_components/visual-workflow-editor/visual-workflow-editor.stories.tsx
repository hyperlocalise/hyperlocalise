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
import { expect, userEvent } from "storybook/test";

import { visualWorkflowDemoDraft } from "./visual-workflow-editor.fixture";
import { VisualWorkflowEditor } from "./visual-workflow-editor";

const meta = {
  title: "App/Automations/VisualWorkflowEditor",
  component: VisualWorkflowEditor,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "HL-626 visual workflow mock. Open Sample graph first — canvas, picker, Test workflow, and Export JSON. No auth or WorkOS flag required.",
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

export const SampleGraph: Story = {
  name: "Sample graph (mentor demo)",
  args: {
    initialName: visualWorkflowDemoDraft.name,
    initialNodes: visualWorkflowDemoDraft.nodes,
    initialEdges: visualWorkflowDemoDraft.edges,
    previewMode: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByDisplayValue("Lead ping")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Export JSON" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Test workflow" })).toBeEnabled();
  },
};

export const Empty: Story = {
  args: {
    previewMode: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Add first step" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Load sample" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "What happens next?" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Add first step" }));
    await userEvent.click(canvas.getByRole("button", { name: /Manual trigger/i }));
    await expect(canvas.getByRole("heading", { name: "Configure step" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Test workflow" })).toBeEnabled();
  },
};
