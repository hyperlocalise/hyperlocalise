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
import { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "@/components/ui/button";
import { buildWorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import {
  workspaceAutomationUndoStackOptions,
  type WorkspaceAutomationFormChange,
} from "@/lib/agents/workspace-automation-undo";
import {
  createDefaultWorkspaceAutomationFormState,
  workspaceAutomationFormHasChanges,
  type WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";
import { cn } from "@/lib/primitives/cn";
import { useUndoShortcuts } from "@/lib/undo-stack/use-undo-shortcuts";
import { useUndoStack } from "@/lib/undo-stack/use-undo-stack";

import { WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { AUTOMATION_ASSISTANT_PAGE_CLASS } from "./automation-assistant-panel";
import { AutomationAssistantPrompt } from "./automation-assistant-prompt";
import {
  AUTOMATION_ASSISTANT_SAMPLE_SCRIPTS,
  createScriptedAutomationAssistantApi,
  SCRIPTED_ASSISTANT_PACES,
  scriptAssistantConversation,
  type ScriptedAssistantFailure,
  type ScriptedAssistantHold,
  type ScriptedAssistantPaceName,
} from "./automation-assistant-scripted-api";
import { useAssistantUndoSteps } from "./automation-assistant-undo-steps";
import {
  automationEditorDisconnectedMswHandlers,
  automationEditorMswHandlers,
} from "./automation-msw-handlers";
import { AutomationUndoRedoButtons, useAutomationUndoNotice } from "./automation-undo-controls";
import { WorkspaceAutomationEditor } from "./workspace-automation-form";

const [SETUP_REQUEST, PULL_REQUEST_REQUEST, DAILY_REQUEST, EMAIL_REQUEST, , , SWITCH_ON_REQUEST] =
  AUTOMATION_ASSISTANT_SAMPLE_SCRIPTS.map((script) => script.request);

const SAVED_AUTOMATION_ID = "11111111-1111-4111-8111-111111111111";
// A turn at the slow pace, with the reply written out, takes longer than the default wait.
const TURN_TIMEOUT_MS = 30_000;

/** The conversation and form of an automation that was set up with the assistant and saved. */
const savedAutomation = scriptAssistantConversation({
  context: buildWorkspaceAutomationEditorContext({
    editorSessionId: "saved",
    mode: "create",
    form: createDefaultWorkspaceAutomationFormState(),
    connections: { github: true, slack: true, email: true },
    timeZone: "Australia/Sydney",
    repositories: [],
    crowdinProjectIds: [],
    contentfulConnectionIds: [],
  }),
  requests: [SETUP_REQUEST, DAILY_REQUEST],
});

type AssistantStoryProps = {
  /** The request typed on the automations page, which the assistant starts with. */
  initialPrompt?: string | null;
  /** How fast a turn plays: `instant` to jump to its end, `slow` to record it. */
  pace?: ScriptedAssistantPaceName;
  /** Stops every turn at one point and keeps it there. */
  hold?: ScriptedAssistantHold | null;
  /** Makes every turn fail the way given. */
  failure?: ScriptedAssistantFailure | null;
  /** A saved automation with a conversation, in place of a new one. */
  saved?: boolean;
  /** A page too narrow for two panes, where the assistant is a sheet. */
  narrow?: boolean;
};

/**
 * The automation page with the assistant, as the app mounts it: the form on an undo stack, the
 * panel beside it. The assistant is the scripted one, so nothing leaves the browser.
 */
function AssistantPage({
  initialPrompt = null,
  pace = "live",
  hold = null,
  failure = null,
  saved = false,
  narrow = false,
}: AssistantStoryProps) {
  const [startForm] = useState(() =>
    saved ? savedAutomation.form : createDefaultWorkspaceAutomationFormState(),
  );
  const [api] = useState(() =>
    createScriptedAutomationAssistantApi({
      pace: SCRIPTED_ASSISTANT_PACES[pace],
      hold,
      failure,
      saved: saved
        ? { automationId: SAVED_AUTOMATION_ID, messages: savedAutomation.messages }
        : undefined,
    }),
  );
  const history = useUndoStack<
    WorkspaceAutomationFormState | null,
    WorkspaceAutomationFormChange | null
  >(startForm, workspaceAutomationUndoStackOptions);
  const form = history.form ?? startForm;
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
  const performUndo = () => {
    const step = historyRef.current.undoStep;
    if (step) {
      historyRef.current.undo();
      notifyUndo(step, runRedo);
    }
  };
  const { runUndo, applyAssistantChange, undoConfirmDialog } = useAssistantUndoSteps(
    historyRef,
    performUndo,
  );
  const { rootRef } = useUndoShortcuts({ onUndo: runUndo, onRedo: runRedo, onSeal: history.seal });

  return (
    // The app's content area: as tall as the window, with the padding the page reaches across.
    <div
      className={cn(
        "flex h-svh flex-col overflow-hidden px-4 py-4 sm:px-6 lg:px-8",
        narrow ? "max-w-[420px] border-e border-border" : undefined,
      )}
    >
      <WorkspacePageShell ref={rootRef} className={AUTOMATION_ASSISTANT_PAGE_CLASS}>
        <WorkspaceAutomationEditor
          actions={
            <>
              <AutomationUndoRedoButtons
                canUndo={history.canUndo}
                canRedo={history.canRedo}
                undoStep={history.undoStep}
                redoStep={history.redoStep}
                onUndo={runUndo}
                onRedo={runRedo}
              />
              <Button type="button" onClick={fn()}>
                {saved ? "Save changes" : "Create automation"}
              </Button>
            </>
          }
          assistantApi={api}
          assistantEnabled
          assistantHasUnsavedChanges={workspaceAutomationFormHasChanges(form, startForm)}
          assistantInitialPrompt={initialPrompt}
          automationId={saved ? SAVED_AUTOMATION_ID : undefined}
          canUpdateKnowledgeMemory
          errors={{}}
          form={form}
          knowledgeAvailable
          mode={saved ? "detail" : "create"}
          onAssistantChange={applyAssistantChange}
          onChange={history.change}
          organizationSlug="acme"
        />
        {undoConfirmDialog}
      </WorkspacePageShell>
    </div>
  );
}

/** Remounted when a control changes, since the scripted assistant is made once per page. */
function AssistantStory(props: AssistantStoryProps) {
  return <AssistantPage key={JSON.stringify(props)} {...props} />;
}

type Canvas = ReturnType<typeof within>;
type User = {
  clear: (element: Element) => Promise<void>;
  click: (element: Element) => Promise<void>;
  type: (element: Element, text: string) => Promise<void>;
};

async function openAssistant(canvas: Canvas, userEvent: User) {
  await userEvent.click(await canvas.findByRole("button", { name: "Configure with assistant" }));
  return within(await canvas.findByRole("region", { name: "Automation assistant" }));
}

async function sendRequest(panel: Canvas, userEvent: User, text: string) {
  const box = panel.getByRole("textbox", { name: "Message the automation assistant" });
  // The box is closed while a turn runs or a saved conversation loads.
  await waitFor(() => expect(box).toBeEnabled(), { timeout: TURN_TIMEOUT_MS });
  // The box empties itself by resetting its form, which simulated typing does not notice.
  await userEvent.clear(box);
  await userEvent.type(box, text);
  await userEvent.click(panel.getByRole("button", { name: "Send" }));
}

/** Waits until the turn that was sent has finished and its reply is the saved one. */
async function waitForTurnEnd(panel: Canvas) {
  await waitFor(
    () =>
      expect(
        panel.getByRole("textbox", { name: "Message the automation assistant" }),
      ).toBeEnabled(),
    { timeout: TURN_TIMEOUT_MS },
  );
}

const meta = {
  title: "App/Automations/Assistant",
  component: AssistantStory,
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
    docs: {
      description: {
        component: [
          "The automation assistant beside the automation form, running in the browser with no server and no model.",
          "A request is matched to a script, and the script's change is made by the same setup logic the real assistant's tool uses, so the form, the notice above it, the panel and Undo behave as they do in the app.",
          "",
          "**Requests it knows** (anything else gets a reply that lists them):",
          "",
          ...AUTOMATION_ASSISTANT_SAMPLE_SCRIPTS.map((script) => `- ${script.request}`),
          "",
          "**Controls for recording:** `pace` sets how fast a turn plays (`instant`, `live`, `slow`). `hold` stops every turn at one point (`thinking`, `tool`, `writing`) and keeps it there. `failure` makes every turn fail. `initialPrompt` starts the page with a request already sent, as when it is typed on the automations page. Changing a control starts the page again.",
          "",
          "Stories with a play function run it on load. To record a story by hand, use **Playground**, which has none.",
        ].join("\n"),
      },
    },
  },
  argTypes: {
    pace: { control: "inline-radio", options: Object.keys(SCRIPTED_ASSISTANT_PACES) },
    hold: { control: "inline-radio", options: [null, "thinking", "tool", "writing"] },
    failure: {
      control: "inline-radio",
      options: [null, "turn_in_progress", "out_of_date", "failed"],
    },
    initialPrompt: { control: "text" },
  },
  args: {
    pace: "live",
    hold: null,
    failure: null,
    initialPrompt: null,
    saved: false,
    narrow: false,
  },
} satisfies Meta<typeof AssistantStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new automation with the assistant closed. Nothing plays by itself. */
export const Playground: Story = {};

/** The page as it opens from the automations page's prompt box: the request sent, the form filling in. */
export const SetUpFromARequest: Story = {
  args: { initialPrompt: SETUP_REQUEST },
  play: async ({ canvas }) => {
    const panel = within(await canvas.findByRole("region", { name: "Automation assistant" }));
    await expect(panel.getByText(SETUP_REQUEST)).toBeInTheDocument();
    await waitFor(
      () => expect(canvas.getByDisplayValue("Competitor news brief")).toBeInTheDocument(),
      { timeout: TURN_TIMEOUT_MS },
    );
    await expect(canvas.getByText("The assistant set up this automation")).toBeInTheDocument();
    await waitForTurnEnd(panel);
    await expect(panel.getByText(/Updated the setup · \d+ changes/)).toBeInTheDocument();
    await expect(panel.getByText(/Nothing is saved until you/)).toBeInTheDocument();
  },
};

/** The panel opened from the form and a request typed into it. */
export const AskFromThePanel: Story = {
  play: async ({ canvas, userEvent }) => {
    const panel = await openAssistant(canvas, userEvent);
    await expect(
      panel.getByText("Describe what this automation should do, or ask for a change."),
    ).toBeInTheDocument();
    await sendRequest(panel, userEvent, PULL_REQUEST_REQUEST);
    await waitFor(
      () =>
        expect(
          canvas.getByDisplayValue("Review translations on pull requests"),
        ).toBeInTheDocument(),
      { timeout: TURN_TIMEOUT_MS },
    );
    await waitForTurnEnd(panel);
  },
};

/** A first setup, then two changes to it, with the first change's list of what it did opened. */
export const FollowUpChanges: Story = {
  args: { initialPrompt: SETUP_REQUEST },
  play: async ({ canvas, userEvent }) => {
    const panel = within(await canvas.findByRole("region", { name: "Automation assistant" }));
    await waitForTurnEnd(panel);
    await sendRequest(panel, userEvent, DAILY_REQUEST);
    await waitForTurnEnd(panel);
    await sendRequest(panel, userEvent, EMAIL_REQUEST);
    await waitForTurnEnd(panel);
    await expect(canvas.getByText("The assistant updated this setup")).toBeInTheDocument();
    await userEvent.click(panel.getAllByRole("button", { name: /Updated the setup/ })[0]!);
    await expect(panel.getByText("Name set to “Competitor news brief”")).toBeInTheDocument();
  },
};

/** The person renames the automation by hand between two requests, and the panel says so. */
export const PageEditedBetweenRequests: Story = {
  args: { initialPrompt: SETUP_REQUEST },
  play: async ({ canvas, userEvent }) => {
    const panel = within(await canvas.findByRole("region", { name: "Automation assistant" }));
    await waitForTurnEnd(panel);
    await userEvent.type(canvas.getByDisplayValue("Competitor news brief"), " (EMEA)");
    await sendRequest(panel, userEvent, DAILY_REQUEST);
    await waitFor(
      () => expect(panel.getByText("You edited the setup · 1 change")).toBeInTheDocument(),
      { timeout: TURN_TIMEOUT_MS },
    );
    await waitForTurnEnd(panel);
  },
};

/** Undo on a change of the assistant's asks first, then takes the whole change back. */
export const UndoTheAssistantsChange: Story = {
  args: { initialPrompt: SETUP_REQUEST },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const panel = within(await canvas.findByRole("region", { name: "Automation assistant" }));
    await waitForTurnEnd(panel);
    await userEvent.click(canvas.getByRole("button", { name: /^Undo/ }));
    const dialog = within(await body.findByRole("alertdialog"));
    await userEvent.click(dialog.getByRole("button", { name: /Undo/ }));
    await waitFor(() => expect(canvas.getByPlaceholderText("Untitled automation")).toHaveValue(""));
    await expect(
      canvas.queryByText("The assistant set up this automation"),
    ).not.toBeInTheDocument();
  },
};

/** Slack is not connected, so its skill is left out and the reply and the notice say what to do. */
export const SkillLeftOut: Story = {
  args: { initialPrompt: SETUP_REQUEST },
  parameters: {
    msw: {
      handlers: automationEditorDisconnectedMswHandlers,
    },
  },
  play: async ({ canvas, userEvent }) => {
    const panel = within(await canvas.findByRole("region", { name: "Automation assistant" }));
    await waitForTurnEnd(panel);
    await userEvent.click(panel.getByRole("button", { name: /Updated the setup/ }));
    await expect(panel.getByText(/^Not added: /)).toBeInTheDocument();
  },
};

/** A request the assistant cannot carry out: it answers, and the panel says nothing was changed. */
export const NothingChanged: Story = {
  play: async ({ canvas, userEvent }) => {
    const panel = await openAssistant(canvas, userEvent);
    await sendRequest(panel, userEvent, SWITCH_ON_REQUEST);
    await waitForTurnEnd(panel);
    await expect(panel.getByText("No changes made to the setup")).toBeInTheDocument();
  },
};

/** A saved automation opened again: the panel shows the conversation that set it up. */
export const SavedAutomationConversation: Story = {
  args: { saved: true },
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/org/acme/automations/${SAVED_AUTOMATION_ID}`,
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    const panel = await openAssistant(canvas, userEvent);
    await expect(await panel.findByText(SETUP_REQUEST)).toBeInTheDocument();
    await expect(panel.getByRole("button", { name: "Start over" })).toBeInTheDocument();
  },
};

/** Held before anything has changed: the panel and the notice above the form both say working. */
export const Working: Story = {
  args: { initialPrompt: SETUP_REQUEST, hold: "thinking" },
  play: async ({ canvas }) => {
    const panel = within(await canvas.findByRole("region", { name: "Automation assistant" }));
    await expect(await panel.findByText("Working…")).toBeInTheDocument();
    await expect(
      await canvas.findByText("The assistant is working on this setup"),
    ).toBeInTheDocument();
  },
};

/** Held while the setup tool runs. */
export const UpdatingTheSetup: Story = {
  args: { initialPrompt: SETUP_REQUEST, hold: "tool" },
  play: async ({ canvas }) => {
    const panel = within(await canvas.findByRole("region", { name: "Automation assistant" }));
    await expect(
      await panel.findByText("Updating the setup…", undefined, { timeout: TURN_TIMEOUT_MS }),
    ).toBeInTheDocument();
  },
};

/** Held halfway through the reply: the form is already filled in while the words are still coming. */
export const WritingTheReply: Story = {
  args: { initialPrompt: SETUP_REQUEST, hold: "writing" },
  play: async ({ canvas }) => {
    await waitFor(
      () => expect(canvas.getByDisplayValue("Competitor news brief")).toBeInTheDocument(),
      { timeout: TURN_TIMEOUT_MS },
    );
    await expect(canvas.getByText("The assistant set up this automation")).toBeInTheDocument();
  },
};

/** The request was refused because an earlier one is still running. */
export const RefusedWhileBusy: Story = {
  args: { failure: "turn_in_progress" },
  play: async ({ canvas, userEvent }) => {
    const panel = await openAssistant(canvas, userEvent);
    await sendRequest(panel, userEvent, SETUP_REQUEST);
    await expect(
      await panel.findByRole("alert", undefined, { timeout: TURN_TIMEOUT_MS }),
    ).toHaveTextContent("The assistant is still working on an earlier request.");
  },
};

/** The request was refused because the conversation moved on in another tab. */
export const RefusedOutOfDate: Story = {
  args: { failure: "out_of_date" },
  play: async ({ canvas, userEvent }) => {
    const panel = await openAssistant(canvas, userEvent);
    await sendRequest(panel, userEvent, SETUP_REQUEST);
    await expect(
      await panel.findByRole("alert", undefined, { timeout: TURN_TIMEOUT_MS }),
    ).toBeInTheDocument();
  },
};

/** The reply never came. */
export const ReplyFailed: Story = {
  args: { failure: "failed" },
  play: async ({ canvas, userEvent }) => {
    const panel = await openAssistant(canvas, userEvent);
    await sendRequest(panel, userEvent, SETUP_REQUEST);
    await expect(
      await panel.findByRole("alert", undefined, { timeout: TURN_TIMEOUT_MS }),
    ).toHaveTextContent("The assistant could not reply. Try again.");
  },
};

/** A page too narrow for two panes: the assistant opens as a sheet over the form. */
export const NarrowPageSheet: Story = {
  args: { narrow: true },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Configure with assistant" }));
    const panel = within(await body.findByRole("region", { name: "Automation assistant" }));
    await sendRequest(panel, userEvent, SETUP_REQUEST);
    await waitForTurnEnd(panel);
  },
};

/** The box on the automations page that hands a request over to a new automation's page. */
export const PromptBox: Story = {
  render: () => (
    <div className="mx-auto max-w-2xl p-8">
      <AutomationAssistantPrompt
        aiFeaturesStatus="allowed"
        onSubmitPrompt={fn()}
        organizationSlug="acme"
      />
    </div>
  ),
};

/** The same box on a plan without AI features. */
export const PromptBoxUpgradeNeeded: Story = {
  render: () => (
    <div className="mx-auto max-w-2xl p-8">
      <AutomationAssistantPrompt
        aiFeaturesStatus="denied"
        onSubmitPrompt={fn()}
        organizationSlug="acme"
      />
    </div>
  ),
};
