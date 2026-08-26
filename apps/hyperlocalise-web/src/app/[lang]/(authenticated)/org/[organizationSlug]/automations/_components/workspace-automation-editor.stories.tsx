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
import { useState, type ReactNode } from "react";
import { PlayIcon, SaveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import { Button } from "@/components/ui/button";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";

import { WorkspacePageShell } from "../../_components/workspace-resource-shared";
import {
  automationRunsFixture,
  createContentfulAutomationFormFixture,
  createDetailAutomationFormFixture,
  createEmptyAutomationFormFixture,
  createGithubAutomationFormFixture,
  createManualAutomationFormFixture,
  createMemoriesAutomationFormFixture,
  createScheduledAutomationFormFixture,
} from "./automation-editor.fixture";
import {
  automationEditorDisconnectedMswHandlers,
  automationEditorMswHandlers,
} from "./automation-msw-handlers";
import { WorkspaceAutomationEditor } from "./workspace-automation-form";

function WorkspaceAutomationEditorStory({
  actions,
  canUpdateKnowledgeMemory = true,
  disabled,
  errors: initialErrors = {},
  form: initialForm,
  knowledgeAvailable = true,
  mode,
  organizationSlug = "acme",
  runHistory,
}: {
  actions?: ReactNode;
  canUpdateKnowledgeMemory?: boolean;
  disabled?: boolean;
  errors?: Record<string, string | undefined>;
  form: WorkspaceAutomationFormState;
  knowledgeAvailable?: boolean;
  mode: "create" | "detail";
  organizationSlug?: string;
  runHistory?: typeof automationRunsFixture;
}) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState(initialErrors);

  return (
    <WorkspacePageShell className="max-w-5xl">
      <WorkspaceAutomationEditor
        actions={actions}
        canUpdateKnowledgeMemory={canUpdateKnowledgeMemory}
        disabled={disabled}
        errors={errors}
        form={form}
        knowledgeAvailable={knowledgeAvailable}
        mode={mode}
        onChange={(next) => {
          setForm(next);
          setErrors({});
        }}
        organizationSlug={organizationSlug}
        runHistory={runHistory}
      />
    </WorkspacePageShell>
  );
}

const meta = {
  title: "App/Automations/Editor",
  component: WorkspaceAutomationEditorStory,
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: automationEditorMswHandlers,
    },
    nextjs: {
      navigation: {
        pathname: "/org/acme/automations/new",
      },
    },
  },
  args: {
    organizationSlug: "acme",
    mode: "create" as const,
    form: createEmptyAutomationFormFixture(),
    errors: {},
    actions: (
      <Button type="button" onClick={fn()}>
        Create automation
      </Button>
    ),
  },
} satisfies Meta<typeof WorkspaceAutomationEditorStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CreateEmpty: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByPlaceholderText("Untitled automation")).toBeInTheDocument();
    await expect(canvas.getByRole("tab", { name: "Settings" })).toBeInTheDocument();
    await expect(canvas.queryByRole("tab", { name: "Run History" })).not.toBeInTheDocument();
    await expect(
      canvas.getByText("Add at least one supported tool to activate this automation."),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Model" })).toHaveTextContent("GPT-5.6 Luna");
  },
};

export const ProjectSelectorForScheduledTrigger: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("button", { name: /Select project/i }),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Add Trigger" }));
    await userEvent.click(await body.findByRole("menuitem", { name: /^Scheduled/ }));
    await expect(canvas.getByRole("button", { name: /Select project/i })).toBeInTheDocument();
  },
};

export const CreateModelOptions: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Model" }));
    await expect(await body.findByRole("option", { name: "GPT-5.6 Luna" })).toBeInTheDocument();
    await expect(body.getByRole("option", { name: "GPT-5.6 Terra" })).toBeInTheDocument();
    await expect(body.getByRole("option", { name: "GPT-5.6 Sol" })).toBeInTheDocument();
    await expect(body.getByRole("option", { name: "Claude Sonnet 5" })).toBeInTheDocument();
    await expect(body.getByRole("option", { name: "Claude Opus 5" })).toBeInTheDocument();
  },
};

export const CreateCrowdinToolConnected: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Add tool" }));
    const crowdinItem = await body.findByRole("menuitem", { name: /^Crowdin$/ });
    await expect(crowdinItem).toBeEnabled();
    await userEvent.click(crowdinItem);
    await expect(
      canvas.getByText(
        "Search concordance, load style guidance, and recommend translations for strings under review.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("combobox", { name: "Marketing Crowdin" }));
    await expect(
      await body.findByRole("option", { name: "Marketing Crowdin" }),
    ).toBeInTheDocument();
  },
};

export const CreateCrowdinToolDisconnected: Story = {
  parameters: {
    msw: {
      handlers: automationEditorDisconnectedMswHandlers,
    },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Add tool" }));
    const crowdinItem = await body.findByRole("menuitem", { name: /Crowdin Connect first/i });
    await expect(crowdinItem).toHaveAttribute("data-disabled");
    await expect(crowdinItem).toHaveTextContent("Connect first");
  },
};

export const CreateFromGithubTemplate: Story = {
  args: {
    form: createGithubAutomationFormFixture(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByDisplayValue("Validate localisation on push")).toBeInTheDocument();
    await expect(canvas.getByText("Active")).toBeInTheDocument();
    await expect(canvas.getByText("2 tools")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create automation" })).toBeInTheDocument();
  },
};

export const CreateFromContentfulTemplate: Story = {
  args: {
    form: createContentfulAutomationFormFixture(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByDisplayValue("Translate Contentful article")).toBeInTheDocument();
    await expect(canvas.getByText("Contentful")).toBeInTheDocument();
  },
};

export const CreateWithMemories: Story = {
  args: {
    form: createMemoriesAutomationFormFixture(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Use workspace guideline")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Manage" })).toBeInTheDocument();
    await expect(canvas.getByText("Allow memory updates")).toBeInTheDocument();
    await expect(canvas.getByText("3 tools")).toBeInTheDocument();
  },
};

export const CreateValidationErrors: Story = {
  args: {
    form: {
      ...createGithubAutomationFormFixture(),
      name: "",
      instructions: "",
    },
    errors: {
      name: "Name is required.",
      instructions: "Instructions are required.",
      slackChannelId: "Choose a Slack channel for notifications.",
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Name is required.")).toBeInTheDocument();
    await expect(canvas.getByText("Instructions are required.")).toBeInTheDocument();
    await expect(canvas.getByText("Choose a Slack channel for notifications.")).toBeInTheDocument();
  },
};

export const DetailDefault: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/org/acme/automations/11111111-1111-4111-8111-111111111111",
      },
    },
  },
  args: {
    mode: "detail",
    form: createDetailAutomationFormFixture(),
    actions: (
      <Button type="button" disabled>
        <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} data-icon="inline-start" />
        Save changes
      </Button>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByDisplayValue("Validate localisation on push")).toBeInTheDocument();
    await expect(canvas.getByRole("tab", { name: "Run History" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Run now" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeDisabled();
  },
};

export const DetailScheduled: Story = {
  args: {
    mode: "detail",
    form: createScheduledAutomationFormFixture(),
    actions: (
      <>
        <Button type="button" variant="outline" onClick={fn()}>
          <HugeiconsIcon icon={PlayIcon} strokeWidth={1.8} data-icon="inline-start" />
          Run now
        </Button>
        <Button type="button" disabled>
          <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} data-icon="inline-start" />
          Save changes
        </Button>
      </>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByDisplayValue("Weekly translation sync")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Run now" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeDisabled();
  },
};

export const DetailManual: Story = {
  args: {
    mode: "detail",
    form: createManualAutomationFormFixture(),
    actions: (
      <>
        <Button type="button" variant="outline" onClick={fn()}>
          <HugeiconsIcon icon={PlayIcon} strokeWidth={1.8} data-icon="inline-start" />
          Run now
        </Button>
        <Button type="button" disabled>
          <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} data-icon="inline-start" />
          Save changes
        </Button>
      </>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByDisplayValue("Manual release checklist")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Run now" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeDisabled();
  },
};

export const DetailPaused: Story = {
  args: {
    mode: "detail",
    form: {
      ...createDetailAutomationFormFixture(),
      status: "paused",
    },
    actions: (
      <Button type="button" disabled>
        <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} data-icon="inline-start" />
        Save changes
      </Button>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Paused")).toBeInTheDocument();
  },
};

export const DetailRunHistory: Story = {
  args: {
    mode: "detail",
    form: createDetailAutomationFormFixture(),
    runHistory: automationRunsFixture,
    actions: (
      <Button type="button" disabled>
        <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} data-icon="inline-start" />
        Save changes
      </Button>
    ),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Run History" }));
    await expect(canvas.getByText("succeeded")).toBeInTheDocument();
    await expect(canvas.getByText("failed")).toBeInTheDocument();
    await expect(canvas.getByText("running")).toBeInTheDocument();
  },
};

export const DetailRunHistoryEmpty: Story = {
  args: {
    mode: "detail",
    form: createDetailAutomationFormFixture(),
    runHistory: [],
    actions: (
      <Button type="button" disabled>
        <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} data-icon="inline-start" />
        Save changes
      </Button>
    ),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Run History" }));
    await expect(canvas.getByText("No runs yet.")).toBeInTheDocument();
  },
};

export const ReadOnly: Story = {
  args: {
    mode: "detail",
    form: createDetailAutomationFormFixture(),
    disabled: true,
    actions: (
      <Button type="button" disabled>
        <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} data-icon="inline-start" />
        Save changes
      </Button>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByPlaceholderText("Untitled automation")).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeDisabled();
  },
};
