import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { Button } from "@/components/ui/button";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";

import { WorkspacePageShell } from "../../_components/workspace-resource-shared";
import {
  automationRunsFixture,
  createContentfulAutomationFormFixture,
  createDetailAutomationFormFixture,
  createEmptyAutomationFormFixture,
  createGithubAutomationFormFixture,
} from "./automation-editor.fixture";
import { automationEditorMswHandlers } from "./automation-msw-handlers";
import { WorkspaceAutomationEditor } from "./workspace-automation-form";

function WorkspaceAutomationEditorStory({
  actions,
  disabled,
  errors: initialErrors = {},
  form: initialForm,
  mode,
  organizationSlug = "acme",
  runHistory,
}: {
  actions?: ReactNode;
  disabled?: boolean;
  errors?: Record<string, string | undefined>;
  form: WorkspaceAutomationFormState;
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
        disabled={disabled}
        errors={errors}
        form={form}
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
    form: createEmptyAutomationFormFixture,
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
    await expect(
      canvas.getByText("Choose a Slack channel for notifications."),
    ).toBeInTheDocument();
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
      <>
        <Button type="button" variant="outline" onClick={fn()}>
          Run now
        </Button>
        <Button type="button" onClick={fn()}>
          Save changes
        </Button>
      </>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByDisplayValue("Validate localisation on push")).toBeInTheDocument();
    await expect(canvas.getByRole("tab", { name: "Run History" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Run now" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
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
      <Button type="button" onClick={fn()}>
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
      <Button type="button" onClick={fn()}>
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
      <Button type="button" onClick={fn()}>
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
        Save changes
      </Button>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByPlaceholderText("Untitled automation")).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeDisabled();
  },
};
