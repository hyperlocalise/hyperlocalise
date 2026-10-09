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
import { useRef, useState, type ReactNode } from "react";
import { PlayIcon, FloppyDiskIcon } from "@phosphor-icons/react/ssr";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, fn, waitFor, within } from "storybook/test";

import { Button } from "@/components/ui/button";
import { addSkillToWorkspaceAutomationForm } from "@/lib/agents/workspace-automation-skill-form";
import {
  workspaceAutomationUndoStackOptions,
  type WorkspaceAutomationFormChange,
} from "@/lib/agents/workspace-automation-undo";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";
import { useUndoShortcuts } from "@/lib/undo-stack/use-undo-shortcuts";
import { useUndoStack } from "@/lib/undo-stack/use-undo-stack";

import { WorkspacePageShell } from "../../_components/workspace-resource-shared";
import {
  automationRunsFixture,
  createContentfulAutomationFormFixture,
  createDetailAutomationFormFixture,
  createEmptyAutomationFormFixture,
  createGithubAutomationFormFixture,
  createIntercomAutomationFormFixture,
  createManualAutomationFormFixture,
  createMemoriesAutomationFormFixture,
  createScheduledAutomationFormFixture,
  intercomAutomationRunsFixture,
} from "./automation-editor.fixture";
import {
  automationEditorDisconnectedMswHandlers,
  automationEditorMswHandlers,
} from "./automation-msw-handlers";
import { AutomationUndoRedoButtons, useAutomationUndoNotice } from "./automation-undo-controls";
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
  onRefreshRunHistory,
  runHistory,
  runHistoryRefreshing,
}: {
  actions?: ReactNode;
  canUpdateKnowledgeMemory?: boolean;
  disabled?: boolean;
  errors?: Record<string, string | undefined>;
  form: WorkspaceAutomationFormState;
  knowledgeAvailable?: boolean;
  mode: "create" | "detail";
  onRefreshRunHistory?: () => void;
  organizationSlug?: string;
  runHistory?: typeof automationRunsFixture;
  runHistoryRefreshing?: boolean;
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
        onRefreshRunHistory={onRefreshRunHistory}
        runHistory={runHistory}
        runHistoryRefreshing={runHistoryRefreshing}
      />
    </WorkspacePageShell>
  );
}

/** The editor on an undo stack, as the automation pages mount it. */
function WorkspaceAutomationUndoStory({
  form: initialForm,
  mode,
}: {
  form: WorkspaceAutomationFormState;
  mode: "create" | "detail";
}) {
  const history = useUndoStack<
    WorkspaceAutomationFormState | null,
    WorkspaceAutomationFormChange | null
  >(initialForm, workspaceAutomationUndoStackOptions);
  const form = history.form ?? initialForm;
  const { notifyUndo, notifyRedo } = useAutomationUndoNotice();
  const historyRef = useRef(history);
  historyRef.current = history;
  const runRedo = () => {
    const step = historyRef.current.redoStep;
    if (step) {
      historyRef.current.redo();
      notifyRedo(step, runUndo);
    }
  };
  const runUndo = () => {
    const step = historyRef.current.undoStep;
    if (step) {
      historyRef.current.undo();
      notifyUndo(step, runRedo);
    }
  };
  const { rootRef } = useUndoShortcuts({ onUndo: runUndo, onRedo: runRedo, onSeal: history.seal });

  return (
    <WorkspacePageShell ref={rootRef} className="max-w-5xl">
      <WorkspaceAutomationEditor
        actions={
          <AutomationUndoRedoButtons
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            undoStep={history.undoStep}
            redoStep={history.redoStep}
            onUndo={runUndo}
            onRedo={runRedo}
          />
        }
        canUpdateKnowledgeMemory
        errors={{}}
        form={form}
        knowledgeAvailable
        mode={mode}
        onChange={history.change}
        organizationSlug="acme"
      />
    </WorkspacePageShell>
  );
}

/** Opens a category in the Add Skill menu. A simulated pointer closes a hover submenu, so use keys. */
async function openSkillCategory(
  canvas: ReturnType<typeof within>,
  body: ReturnType<typeof within>,
  userEvent: {
    click: (element: Element) => Promise<void>;
    keyboard: (text: string) => Promise<void>;
    hover: (element: Element) => Promise<void>;
  },
  category: string,
) {
  if (canvas.getByRole("button", { name: "Add Skill" }).getAttribute("aria-expanded") !== "true") {
    await userEvent.click(canvas.getByRole("button", { name: "Add Skill" }));
  }
  await userEvent.hover(await body.findByRole("menuitem", { name: category }));
  await userEvent.keyboard("{ArrowRight}");
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
      appDirectory: true,
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
    // A new automation has settings only, so no tabs are offered.
    await expect(canvas.queryByRole("tablist")).not.toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Trigger" })).toBeInTheDocument();
    await expect(
      canvas.getByText("Add at least one supported tool to activate this automation."),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Model" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Model" })).toHaveTextContent("GPT-6 Luna");
  },
};

export const ProjectSelectorForScheduledTrigger: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("button", { name: /Select project/i }),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Manually triggered" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "On a schedule" }));
    await expect(canvas.getByRole("button", { name: /Select project/i })).toBeInTheDocument();
  },
};

export const CreateModelOptions: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Model" }));
    await expect(await body.findByRole("menuitem", { name: "GPT-6 Luna" })).toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "GPT-6 Astra" })).toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "GPT-6 Sol" })).toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "GPT-5.6 Terra" })).toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "GPT-5.6 Sol" })).toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "Claude Sonnet 5" })).toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "Claude Opus 5.5" })).toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "Claude Opus 5" })).toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "Gemini 3.8 Flash" })).toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "Gemini 3.7 Flash" })).toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "Gemini 3.6 Flash" })).toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "Gemini 3.5 Flash" })).toBeInTheDocument();
    await expect(
      body.getByRole("menuitem", { name: "Gemini 3.1 Pro Preview" }),
    ).toBeInTheDocument();
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

export const CreateFromIntercomTemplate: Story = {
  args: {
    form: createIntercomAutomationFormFixture(),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByDisplayValue("Translate Intercom Help Center articles"),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Intercom Help Center")).toBeInTheDocument();
    await expect(await canvas.findByText("Customer Support")).toBeInTheDocument();
    await expect(canvas.queryByText(/^Locales:/)).not.toBeInTheDocument();
    await expect(canvas.getByLabelText("Intercom source locale")).toHaveTextContent("English (en)");
    await expect(canvas.getByLabelText("Collections (optional)")).toHaveTextContent(
      "Getting started",
    );
    await expect(canvas.getByText("Include draft articles on import")).toBeInTheDocument();
  },
};

export const CreateIntercomAutopicksHelpCenter: Story = {
  args: {
    form: {
      ...createIntercomAutomationFormFixture(),
      projectId: "project_mobile",
      intercomHelpCenterId: "",
      intercomHelpCenterLocales: [],
      intercomCollectionIds: [],
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Customer Support")).toBeInTheDocument();
    await expect(canvas.queryByText(/^Locales:/)).not.toBeInTheDocument();
    await expect(canvas.getByLabelText("Intercom source locale")).toHaveTextContent("English (en)");
    await expect(
      await canvas.findByText("Spanish (Spain) (es-ES) → Unmapped, skipped"),
    ).toBeInTheDocument();
  },
};

export const CreateIntercomDisconnected: Story = {
  parameters: {
    msw: {
      handlers: automationEditorDisconnectedMswHandlers,
    },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await openSkillCategory(canvas, body, userEvent, "Translate");
    await waitFor(() =>
      expect(
        body.getByRole("menuitem", { name: /^Translate Intercom Help Center articles/ }),
      ).toHaveAttribute("aria-disabled", "true"),
    );
    const intercom = body.getByRole("menuitem", {
      name: /^Translate Intercom Help Center articles/,
    });
    await expect(within(intercom).getByText("Connect Intercom first")).toBeInTheDocument();
  },
};

export const AddSkillEnablesTools: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.getByText("Pick what this automation should do. Each skill adds the tools it needs."),
    ).toBeInTheDocument();
    await openSkillCategory(canvas, body, userEvent, "Research");
    await fireEvent.click(await body.findByRole("menuitem", { name: /^Research the web/ }));
    await expect(
      canvas.getByText(/Searches the public web\. Changes nothing\./),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Required for skill")).toBeInTheDocument();
    await expect(canvas.getByText("1 tool")).toBeInTheDocument();
  },
};

export const SuggestsFromInstructions: Story = {
  args: {
    form: {
      ...createEmptyAutomationFormFixture(),
      name: "Market brief",
      instructions: "Research competitors each morning, post a brief to Slack and check Ahrefs.",
    },
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Suggested")).toBeInTheDocument();
    const ahrefsChip = canvas.getByRole("button", { name: "Add Ahrefs" });
    // The chips sit beside the section title, above the instructions box, and a new one flashes.
    const titleRow = canvas.getByRole("heading", { name: "Agent Instructions" }).parentElement;
    await expect(titleRow).toContainElement(ahrefsChip);
    await expect(
      ahrefsChip.compareDocumentPosition(canvas.getByDisplayValue(/^Research competitors/)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect(ahrefsChip.parentElement).toHaveClass("animate-suggestion-flash");
    await userEvent.click(canvas.getByRole("button", { name: "Add Research the web" }));
    await expect(canvas.getByText("Required for skill")).toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Add Research the web" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Dismiss suggestion Post results to Slack" }),
    );
    await expect(
      canvas.queryByRole("button", { name: "Add Post results to Slack" }),
    ).not.toBeInTheDocument();
  },
};

export const RiskySkillAsksFirst: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await openSkillCategory(canvas, body, userEvent, "Report results");
    await fireEvent.click(await body.findByRole("menuitem", { name: /^Email results/ }));
    await expect(
      await body.findByRole("alertdialog", { name: "Add Email results?" }),
    ).toBeInTheDocument();
    await expect(body.getByText(/cannot be recalled/)).toBeInTheDocument();
    await expect(canvas.queryByText("Required for skill")).not.toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Add skill" }));
    await expect(await canvas.findByText("Required for skill")).toBeInTheDocument();
  },
};

export const DisconnectedSkillIsGreyedOut: Story = {
  parameters: {
    msw: {
      handlers: automationEditorDisconnectedMswHandlers,
    },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await openSkillCategory(canvas, body, userEvent, "Report results");
    // Query again on each try: the item re-renders once the Slack connection has loaded.
    await waitFor(() =>
      expect(body.getByRole("menuitem", { name: /^Post results to Slack/ })).toHaveAttribute(
        "aria-disabled",
        "true",
      ),
    );
    const slack = body.getByRole("menuitem", { name: /^Post results to Slack/ });
    await expect(within(slack).getByText("Connect Slack first")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}");
    await openSkillCategory(canvas, body, userEvent, "Research");
    await expect(
      await body.findByRole("menuitem", { name: /^Research the web/ }),
    ).not.toHaveAttribute("aria-disabled", "true");
  },
};

export const CreateWithSkills: Story = {
  args: {
    form: ["review-translation-changes", "post-to-slack"].reduce(
      (form, skillId) => addSkillToWorkspaceAutomationForm(form, skillId),
      { ...createEmptyAutomationFormFixture(), name: "Review translations" },
    ),
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Review translation changes")).toBeInTheDocument();
    await expect(canvas.getAllByText("Required for skill")).toHaveLength(2);
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove skill Post results to Slack" }),
    );
    await expect(canvas.getAllByText("Required for skill")).toHaveLength(1);
    await expect(canvas.getByText("1 tool")).toBeInTheDocument();
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
      appDirectory: true,
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
        <FloppyDiskIcon data-icon="inline-start" />
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
          <PlayIcon data-icon="inline-start" />
          Run now
        </Button>
        <Button type="button" disabled>
          <FloppyDiskIcon data-icon="inline-start" />
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
          <PlayIcon data-icon="inline-start" />
          Run now
        </Button>
        <Button type="button" disabled>
          <FloppyDiskIcon data-icon="inline-start" />
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
        <FloppyDiskIcon data-icon="inline-start" />
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
    onRefreshRunHistory: fn(),
    runHistory: automationRunsFixture,
    actions: (
      <Button type="button" disabled>
        <FloppyDiskIcon data-icon="inline-start" />
        Save changes
      </Button>
    ),
  },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Run History" }));
    await userEvent.click(canvas.getByRole("button", { name: "Refresh" }));
    await expect(args.onRefreshRunHistory).toHaveBeenCalledOnce();
    await expect(canvas.getByText("Succeeded")).toBeInTheDocument();
    await expect(canvas.getByText("Failed")).toBeInTheDocument();
    await expect(canvas.getByText("Running")).toBeInTheDocument();
    // The summary reads as a sentence when collapsed and in full, by field, when opened.
    await expect(canvas.getByText("GitHub sync failed")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /Reviewed 12 changed locale files/ }));
    await expect(canvas.getByText("Repository full name")).toBeInTheDocument();
    await expect(canvas.getByText("acme/website")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "View raw JSON" }));
    await expect(canvas.getByText(/"repositoryFullName": "acme\/website"/)).toBeInTheDocument();
  },
};

export const DetailIntercomRunHistory: Story = {
  args: {
    mode: "detail",
    form: createIntercomAutomationFormFixture(),
    onRefreshRunHistory: fn(),
    runHistory: intercomAutomationRunsFixture,
    actions: (
      <>
        <Button type="button" variant="outline" onClick={fn()}>
          <PlayIcon data-icon="inline-start" />
          Run now
        </Button>
        <Button type="button" disabled>
          <FloppyDiskIcon data-icon="inline-start" />
          Save changes
        </Button>
      </>
    ),
  },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("Customer Support")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "Run History" }));
    await expect(
      canvas.getByText(/Imported 2 published articles from Customer Support/),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/Pushed approved drafts to Intercom for Getting started with Acme/),
    ).toBeInTheDocument();
  },
};

export const DetailRunHistoryEmpty: Story = {
  args: {
    mode: "detail",
    form: createDetailAutomationFormFixture(),
    onRefreshRunHistory: fn(),
    runHistory: [],
    actions: (
      <Button type="button" disabled>
        <FloppyDiskIcon data-icon="inline-start" />
        Save changes
      </Button>
    ),
  },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Run History" }));
    await expect(canvas.getByText("No runs yet.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Refresh" }));
    await expect(args.onRefreshRunHistory).toHaveBeenCalledOnce();
  },
};

export const ReadOnly: Story = {
  args: {
    mode: "detail",
    form: createDetailAutomationFormFixture(),
    disabled: true,
    actions: (
      <Button type="button" disabled>
        <FloppyDiskIcon data-icon="inline-start" />
        Save changes
      </Button>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByPlaceholderText("Untitled automation")).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeDisabled();
  },
};

export const UndoTyping: Story = {
  args: {
    mode: "detail",
    form: createScheduledAutomationFormFixture(),
  },
  render: (args) => <WorkspaceAutomationUndoStory form={args.form} mode={args.mode} />,
  play: async ({ canvas, userEvent }) => {
    const name = canvas.getByPlaceholderText("Untitled automation");
    const original = (name as HTMLInputElement).value;
    await expect(canvas.getByRole("button", { name: "Undo" })).toBeDisabled();

    await userEvent.type(name, " extra");
    await expect(name).toHaveValue(`${original} extra`);
    await expect(canvas.getByRole("button", { name: "Undo" })).toBeEnabled();

    // A burst of typing is one step.
    await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
    await expect(name).toHaveValue(original);
    await expect(canvas.getByRole("button", { name: "Undo" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Redo" })).toBeEnabled();

    await userEvent.click(canvas.getByRole("button", { name: "Redo" }));
    await expect(name).toHaveValue(`${original} extra`);
  },
};

export const UndoSwitch: Story = {
  args: {
    mode: "detail",
    form: createScheduledAutomationFormFixture(),
  },
  render: (args) => <WorkspaceAutomationUndoStory form={args.form} mode={args.mode} />,
  play: async ({ canvas, userEvent }) => {
    const status = canvas.getByRole("switch");
    const wasChecked = status.getAttribute("aria-checked");

    await userEvent.click(status);
    await waitFor(() => expect(status).not.toHaveAttribute("aria-checked", wasChecked));

    await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(status).toHaveAttribute("aria-checked", wasChecked));
    await expect(canvas.getByRole("button", { name: "Redo" })).toBeEnabled();
  },
};
