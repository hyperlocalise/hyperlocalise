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
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { toVisualWorkflowV3Definition } from "@/lib/visual-workflows/schema/serializers";
import type { VisualWorkflowEditorState } from "@/lib/visual-workflows/schema/types";

import {
  createScriptedAutomationAssistantApi,
  SCRIPTED_ASSISTANT_PACES,
  VISUAL_WORKFLOW_ASSISTANT_SAMPLE_SCRIPTS,
} from "../automation-assistant-scripted-api";
import { VisualWorkflowEditor } from "./visual-workflow-editor";

const TURN_TIMEOUT_MS = 30_000;

const startDraft: VisualWorkflowEditorState = {
  name: "Nightly sync",
  nodes: [
    {
      id: "trigger",
      type: "trigger.manual",
      position: { x: 80, y: 180 },
      data: {
        catalogType: "trigger.manual",
        config: { kind: "trigger.manual" },
        runStatus: "idle",
      },
    },
  ],
  edges: [],
};

type AssistantStoryProps = {
  pace?: keyof typeof SCRIPTED_ASSISTANT_PACES;
};

/**
 * A saved workflow's editor with the assistant offered, as the page mounts it. The assistant is
 * the scripted one, so nothing leaves the browser.
 */
function AssistantEditor({ pace = "live" }: AssistantStoryProps) {
  const [api] = useState(() =>
    createScriptedAutomationAssistantApi({ pace: SCRIPTED_ASSISTANT_PACES[pace] }),
  );
  return (
    <VisualWorkflowEditor
      assistantApi={api}
      assistantEnabled
      initialEdges={startDraft.edges}
      initialName={startDraft.name}
      initialNodes={startDraft.nodes}
      onSave={fn()}
      organizationSlug="acme"
      savedDefinition={toVisualWorkflowV3Definition(startDraft)}
      visualWorkflowId="workflow-1"
    />
  );
}

/** Remounted when a control changes, since the scripted assistant is made once per page. */
function AssistantStory(props: AssistantStoryProps) {
  return <AssistantEditor key={JSON.stringify(props)} {...props} />;
}

const meta = {
  title: "App/Automations/Visual Workflow/Assistant",
  component: AssistantStory,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true },
    docs: {
      description: {
        component: `The automation assistant beside a visual workflow's canvas. It knows these requests: ${VISUAL_WORKFLOW_ASSISTANT_SAMPLE_SCRIPTS.map((script) => `"${script.request}"`).join(", ")}.`,
      },
    },
  },
  argTypes: {
    pace: { control: "inline-radio", options: Object.keys(SCRIPTED_ASSISTANT_PACES) },
  },
  decorators: [
    (Story) => (
      <div className="flex h-[100svh] flex-col">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AssistantStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Beside: Story = {
  name: "Beside the canvas",
  args: { pace: "live" },
};

export const AddsAStep: Story = {
  name: "Adds a step, and asks before Undo takes it back",
  args: { pace: "instant" },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Configure with assistant" }));
    const panel = within(await canvas.findByRole("region", { name: "Automation assistant" }));
    const box = panel.getByRole("textbox", { name: "Message the automation assistant" });
    await waitFor(() => expect(box).toBeEnabled(), { timeout: TURN_TIMEOUT_MS });
    await userEvent.type(box, VISUAL_WORKFLOW_ASSISTANT_SAMPLE_SCRIPTS[0]!.request);
    await userEvent.click(panel.getByRole("button", { name: "Send" }));

    // The change lines are folded under the call's summary until it is opened.
    await userEvent.click(
      await panel.findByText("Updated the workflow · 2 changes", {}, { timeout: TURN_TIMEOUT_MS }),
    );
    await expect(await panel.findByText("Added the Notify Slack step")).toBeInTheDocument();
    const step = () =>
      canvasElement.querySelector<HTMLElement>('.react-flow__node[data-id="notify_slack"]');
    await waitFor(() => expect(step()).not.toBeNull());
    // A step the assistant added is marked until it is selected, and brought into view.
    await expect(step()!.querySelector('[data-slot="step-band"]')).not.toBeNull();
    await waitFor(async () => {
      const box = step()!.getBoundingClientRect();
      const view = canvasElement.querySelector<HTMLElement>(".react-flow")!.getBoundingClientRect();
      await expect(box.left >= view.left && box.left < view.right).toBe(true);
    });

    await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
    const dialog = within(await within(document.body).findByRole("alertdialog"));
    await expect(dialog.getByText("Undo the assistant's changes?")).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(step()).toBeNull());
  },
};
