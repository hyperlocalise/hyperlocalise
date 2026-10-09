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
// @vitest-environment happy-dom

import type { UIMessage } from "ai";
import { observable, runInAction } from "mobx";
import { StrictMode, useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  readAutomationSetupPageEdits,
  updateWorkspaceAutomationSetup,
} from "@/lib/agents/workspace-automation-assistant";
import type { WorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import {
  createDefaultWorkspaceAutomationFormState,
  type WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";

import {
  AssistantSessionOutOfDateError,
  AssistantTurnInProgressError,
} from "./automation-assistant-api";
import {
  AutomationAssistantProvider,
  useAutomationAssistant,
} from "./automation-assistant-provider";

const api = vi.hoisted(() => ({
  createAssistantSession: vi.fn(),
  findAssistantSession: vi.fn(),
  loadAssistantSession: vi.fn(),
  deleteAssistantSession: vi.fn(),
  streamAssistantTurn: vi.fn(),
  setPanelOpen: vi.fn(),
  /** The app shell a test wants in place of the one that only records what the dock is told. */
  shell: { current: null as { chatDock: unknown } | null },
}));

vi.mock("./automation-assistant-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./automation-assistant-api")>();
  return { ...actual, ...api };
});

vi.mock("@/components/app-shell/store/app-shell-store-context", () => ({
  useOptionalAppShellStore: () =>
    api.shell.current ?? { chatDock: { setPanelOpen: api.setPanelOpen } },
}));

const session = (id: string, automationId: string | null = null) => ({
  id,
  automationId,
  title: "Automation assistant",
  turnInProgress: false,
  createdAt: "2026-10-09T00:00:00.000Z",
  lastMessageAt: "2026-10-09T00:00:00.000Z",
});

/** A reply whose tool call changed the page the turn was sent from (or another one). */
function replyFor(
  context: WorkspaceAutomationEditorContext,
  editorSessionId = context.editorSessionId,
): UIMessage {
  const { output } = updateWorkspaceAutomationSetup(
    { ...context, editorSessionId },
    {
      name: "Weekly digest",
      instructions: null,
      trigger: null,
      addSkillIds: ["research-web"],
      removeSkillIds: [],
    },
  );
  return {
    id: "stream-1",
    role: "assistant",
    parts: [
      {
        type: "tool-update_automation_setup",
        state: "output-available",
        toolCallId: "call_1",
        input: {},
        output,
      },
      { type: "text", text: 'I\'ve set up "Weekly digest".' },
    ],
  };
}

function Consumer() {
  const assistant = useAutomationAssistant();
  if (!assistant) {
    return <p>no assistant</p>;
  }
  return (
    <div>
      <p>{`status:${assistant.status} open:${assistant.open} calls:${assistant.appliedCallCount} changes:${assistant.appliedChangeCount} failure:${assistant.failure?.reason ?? "none"}`}</p>
      <p>{`failed:${assistant.messages.findIndex((message) => message.id === assistant.failure?.messageId)}`}</p>
      <p>{`messages:${assistant.messages.map((message) => message.senderType).join(",")}`}</p>
      <p>{`edits:${assistant.messages.map((message) => readAutomationSetupPageEdits(message.parts).length).join(",")}`}</p>
      <button type="button" onClick={() => assistant.send("Post a weekly summary")}>
        Send
      </button>
      <button type="button" onClick={assistant.startOver}>
        Start over
      </button>
      <button type="button" onClick={() => assistant.setOpen(true)}>
        Open
      </button>
    </div>
  );
}

function renderProvider(
  props: Partial<React.ComponentProps<typeof AutomationAssistantProvider>> = {},
  options: { settled?: boolean; strict?: boolean } = {},
) {
  const changes: WorkspaceAutomationFormState[] = [];
  function Harness(harness: { connectionsSettled: boolean }) {
    const [form, setForm] = useState(createDefaultWorkspaceAutomationFormState());
    return (
      <AutomationAssistantProvider
        connections={{ slack: true, github: true }}
        connectionsSettled={harness.connectionsSettled}
        contentfulConnectionIds={[]}
        crowdinProjectIds={[]}
        form={form}
        mode="create"
        onChange={(next) => {
          changes.push(next);
          setForm(next);
        }}
        organizationSlug="acme"
        repositories={[]}
        {...props}
      >
        <Consumer />
      </AutomationAssistantProvider>
    );
  }
  const view = render(<Harness connectionsSettled={options.settled ?? true} />, {
    wrapper: options.strict ? StrictMode : undefined,
  });
  return { ...view, changes, Harness };
}

afterEach(() => {
  vi.clearAllMocks();
  api.shell.current = null;
});

describe("AutomationAssistantProvider", () => {
  it("sends a message, applies the assistant's change once, and keeps the saved reply", async () => {
    const user = userEvent.setup();
    api.createAssistantSession.mockResolvedValue(session("sess-1"));
    api.streamAssistantTurn.mockImplementation(async function* (input: {
      pageContext: WorkspaceAutomationEditorContext;
    }) {
      const reply = replyFor(input.pageContext);
      yield reply;
      yield reply;
    });
    api.loadAssistantSession.mockResolvedValue({
      session: session("sess-1"),
      messages: [
        {
          id: "m1",
          conversationId: "sess-1",
          senderType: "user",
          senderEmail: null,
          text: "Post a weekly summary",
          parts: null,
          attachments: null,
          createdAt: "",
        },
        {
          id: "m2",
          conversationId: "sess-1",
          senderType: "agent",
          senderEmail: null,
          text: "Done",
          parts: null,
          attachments: null,
          createdAt: "",
        },
      ],
    });
    const { changes } = renderProvider();

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText(/status:idle open:true calls:1 changes:2/)).toBeTruthy();
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ name: "Weekly digest", skillIds: ["research-web"] });
    expect(api.createAssistantSession).toHaveBeenCalledWith("acme", null);
    expect(api.setPanelOpen).toHaveBeenCalledWith(false);
    expect(screen.getByText("messages:user,agent")).toBeTruthy();
  });

  it("stops counting its changes as unsaved once the page is saved", async () => {
    const user = userEvent.setup();
    api.createAssistantSession.mockResolvedValue(session("sess-1"));
    api.streamAssistantTurn.mockImplementation(async function* (input: {
      pageContext: WorkspaceAutomationEditorContext;
    }) {
      yield replyFor(input.pageContext);
    });
    api.loadAssistantSession.mockResolvedValue({ session: session("sess-1"), messages: [] });
    function Page() {
      const [form, setForm] = useState(createDefaultWorkspaceAutomationFormState());
      const [saved, setSaved] = useState(form);
      return (
        <AutomationAssistantProvider
          connections={{ slack: true, github: true }}
          connectionsSettled
          contentfulConnectionIds={[]}
          crowdinProjectIds={[]}
          form={form}
          hasUnsavedChanges={form !== saved}
          mode="detail"
          onChange={setForm}
          organizationSlug="acme"
          repositories={[]}
        >
          <Consumer />
          <button type="button" onClick={() => setSaved(form)}>
            Save
          </button>
          <button type="button" onClick={() => setForm({ ...form, name: "Edited by hand" })}>
            Edit
          </button>
        </AutomationAssistantProvider>
      );
    }
    render(<Page />);

    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(screen.getByText(/status:idle open:true calls:1 changes:2/)).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/calls:0 changes:0/)).toBeTruthy();

    // A later edit by hand is unsaved, and is not the assistant's.
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText(/calls:0 changes:0/)).toBeTruthy();
  });

  it("folds the dock away when it opens, and closes when a chat is opened in the dock", async () => {
    const user = userEvent.setup();
    const chatDock = observable({ panelOpen: true });
    api.shell.current = {
      chatDock: {
        get panelOpen() {
          return chatDock.panelOpen;
        },
        setPanelOpen: (open: boolean) => {
          runInAction(() => {
            chatDock.panelOpen = open;
          });
        },
      },
    };
    renderProvider();

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText(/open:true/)).toBeTruthy();
    expect(chatDock.panelOpen).toBe(false);

    act(() => {
      runInAction(() => {
        chatDock.panelOpen = true;
      });
    });
    expect(screen.getByText(/open:false/)).toBeTruthy();
  });

  it("shows what the person changed on the page above their message as soon as the turn says so", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    api.createAssistantSession.mockResolvedValue(session("sess-1"));
    api.streamAssistantTurn.mockImplementation(async function* () {
      yield {
        id: "stream-1",
        role: "assistant",
        parts: [{ type: "data-page-edits", data: { edits: [{ kind: "name", name: "Old name" }] } }],
      };
      // The reply is still being written while the line is already there.
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    api.loadAssistantSession.mockResolvedValue({ session: session("sess-1"), messages: [] });
    renderProvider();

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("edits:1")).toBeTruthy();
    });
    expect(screen.getByText(/status:streaming/)).toBeTruthy();
    finish();
  });

  it("ignores a change made for another page", async () => {
    const user = userEvent.setup();
    api.createAssistantSession.mockResolvedValue(session("sess-1"));
    api.streamAssistantTurn.mockImplementation(async function* (input: {
      pageContext: WorkspaceAutomationEditorContext;
    }) {
      yield replyFor(input.pageContext, "another-editor");
    });
    api.loadAssistantSession.mockResolvedValue({ session: session("sess-1"), messages: [] });
    const { changes } = renderProvider();

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText(/status:idle/)).toBeTruthy();
    });
    expect(changes).toEqual([]);
    expect(screen.getByText(/calls:0 changes:0/)).toBeTruthy();
  });

  it("resumes a saved automation's session and applies nothing from its history", async () => {
    api.findAssistantSession.mockImplementation(async () => ({
      session: session("sess-2", "automation-a"),
      messages: [
        {
          id: "m1",
          conversationId: "sess-2",
          senderType: "user",
          senderEmail: null,
          text: "Make it weekly",
          parts: null,
          attachments: null,
          createdAt: "",
        },
        {
          id: "m2",
          conversationId: "sess-2",
          senderType: "agent",
          senderEmail: null,
          text: "Done",
          parts: [
            {
              type: "tool-update_automation_setup",
              state: "output-available",
              toolCallId: "old",
              input: {},
              output: {
                applied: true,
                editorSessionId: "gone",
                proposal: {
                  name: "Old name",
                  instructions: null,
                  trigger: null,
                  addSkillIds: [],
                  removeSkillIds: [],
                  notes: [],
                },
              },
            },
          ],
          attachments: null,
          createdAt: "",
        },
      ],
    }));
    const { changes } = renderProvider({ automationId: "automation-a", mode: "detail" });

    await waitFor(() => {
      expect(screen.getByText("messages:user,agent")).toBeTruthy();
    });
    expect(api.findAssistantSession).toHaveBeenCalledWith("acme", "automation-a");
    expect(changes).toEqual([]);
    expect(screen.getByText(/calls:0 changes:0/)).toBeTruthy();
  });

  it("starts over by dropping the session", async () => {
    const user = userEvent.setup();
    api.createAssistantSession.mockResolvedValue(session("sess-1"));
    api.streamAssistantTurn.mockImplementation(async function* () {});
    api.loadAssistantSession.mockResolvedValue({
      session: session("sess-1"),
      messages: [
        {
          id: "m1",
          conversationId: "sess-1",
          senderType: "user",
          senderEmail: null,
          text: "Hi",
          parts: null,
          attachments: null,
          createdAt: "",
        },
      ],
    });
    api.deleteAssistantSession.mockResolvedValue(undefined);
    renderProvider();
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(screen.getByText("messages:user")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "Start over" }));

    expect(api.deleteAssistantSession).toHaveBeenCalledWith("acme", "sess-1");
    expect(screen.getByText("messages:")).toBeTruthy();
  });

  it("asks for the next session only once Start over has deleted the old one", async () => {
    const user = userEvent.setup();
    api.findAssistantSession.mockResolvedValue({
      session: session("sess-old", "automation-a"),
      messages: [],
    });
    let finishDeleting: () => void = () => {};
    api.deleteAssistantSession.mockReturnValue(
      new Promise<void>((resolve) => {
        finishDeleting = resolve;
      }),
    );
    api.createAssistantSession.mockResolvedValue(session("sess-new", "automation-a"));
    api.streamAssistantTurn.mockImplementation(async function* () {});
    api.loadAssistantSession.mockResolvedValue({
      session: session("sess-new", "automation-a"),
      messages: [],
    });
    renderProvider({ automationId: "automation-a", mode: "detail" });
    await waitFor(() => {
      expect(screen.getByText(/status:idle/)).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "Start over" }));
    await user.click(screen.getByRole("button", { name: "Send" }));

    // While the old session is still there, the server would hand it back as the person's one.
    expect(api.deleteAssistantSession).toHaveBeenCalledWith("acme", "sess-old");
    expect(api.createAssistantSession).not.toHaveBeenCalled();
    expect(screen.getByText(/status:streaming/)).toBeTruthy();

    finishDeleting();

    await waitFor(() => {
      expect(api.streamAssistantTurn).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "sess-new", lastTurnId: null }),
      );
    });
    expect(api.createAssistantSession).toHaveBeenCalledWith("acme", "automation-a");
  });

  it("shows a handed-over request as working from the first render and sends it once the integrations are known", async () => {
    api.createAssistantSession.mockResolvedValue(session("sess-1"));
    api.streamAssistantTurn.mockImplementation(async function* () {});
    api.loadAssistantSession.mockResolvedValue({ session: session("sess-1"), messages: [] });
    const { Harness, rerender } = renderProvider(
      { initialPrompt: "Post a weekly summary" },
      { settled: false },
    );

    // Before anything has loaded: the panel is open with the request in it, and it is working.
    expect(screen.getByText(/status:streaming open:true/)).toBeTruthy();
    expect(screen.getByText("messages:user")).toBeTruthy();
    expect(api.setPanelOpen).toHaveBeenCalledWith(false);

    // The session is made while the integrations load; the turn waits for them.
    await waitFor(() => {
      expect(api.createAssistantSession).toHaveBeenCalledTimes(1);
    });
    expect(api.streamAssistantTurn).not.toHaveBeenCalled();

    rerender(<Harness connectionsSettled />);

    await waitFor(() => {
      expect(api.streamAssistantTurn).toHaveBeenCalledTimes(1);
    });
    expect(api.streamAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Post a weekly summary", sessionId: "sess-1" }),
    );
    expect(api.createAssistantSession).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText(/status:idle/)).toBeTruthy();
    });
  });

  it("sends a handed-over request once, and finishes, when development mounts the page twice", async () => {
    api.createAssistantSession.mockResolvedValue(session("sess-1"));
    api.streamAssistantTurn.mockImplementation(async function* (input: { signal?: AbortSignal }) {
      // As the real request does: a turn whose page has already let go of it never starts.
      if (input.signal?.aborted) {
        throw new DOMException("aborted", "AbortError");
      }
      yield* [];
    });
    api.loadAssistantSession.mockResolvedValue({ session: session("sess-1"), messages: [] });

    // The integrations are already known, as on a second visit, so nothing delays the send.
    renderProvider({ initialPrompt: "Post a weekly summary" }, { strict: true });

    await waitFor(() => {
      expect(screen.getByText(/status:idle/)).toBeTruthy();
    });
    expect(api.createAssistantSession).toHaveBeenCalledTimes(1);
    expect(api.streamAssistantTurn).toHaveBeenCalledTimes(1);
    expect(api.loadAssistantSession).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/failure:none/)).toBeTruthy();
  });

  it("shows a typed message at once, before its session exists", async () => {
    const user = userEvent.setup();
    let finishCreating: (value: ReturnType<typeof session>) => void = () => {};
    api.createAssistantSession.mockReturnValue(
      new Promise((resolve) => {
        finishCreating = resolve;
      }),
    );
    api.streamAssistantTurn.mockImplementation(async function* () {});
    api.loadAssistantSession.mockResolvedValue({ session: session("sess-1"), messages: [] });
    renderProvider();

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText(/status:streaming open:true/)).toBeTruthy();
    expect(screen.getByText("messages:user")).toBeTruthy();
    expect(api.streamAssistantTurn).not.toHaveBeenCalled();

    finishCreating(session("sess-1"));

    await waitFor(() => {
      expect(api.streamAssistantTurn).toHaveBeenCalledTimes(1);
    });
  });

  it("says when a turn is already running", async () => {
    const user = userEvent.setup();
    api.createAssistantSession.mockResolvedValue(session("sess-1"));
    api.streamAssistantTurn.mockImplementation(async function* () {
      yield* [];
      throw new AssistantTurnInProgressError();
    });
    renderProvider();

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText(/failure:turn_in_progress/)).toBeTruthy();
    });
    expect(screen.getByText(/status:idle/)).toBeTruthy();
    expect(screen.getByText("failed:0")).toBeTruthy();
  });

  it("sends the latest turn it has seen: the one it loaded, then the one it ran", async () => {
    const user = userEvent.setup();
    const saved = (id: string) => ({
      id,
      conversationId: "sess-2",
      senderType: "user" as const,
      senderEmail: null,
      text: "Make it weekly",
      parts: null,
      attachments: null,
      createdAt: "",
    });
    api.findAssistantSession.mockResolvedValue({
      session: session("sess-2", "automation-a"),
      messages: [saved("turn-1")],
    });
    api.streamAssistantTurn.mockImplementation(async function* () {
      yield {
        id: "stream-1",
        role: "assistant",
        parts: [{ type: "data-turn", data: { id: "turn-2" } }],
      };
    });
    // The saved conversation holds a turn another tab ran meanwhile, which this page never saw.
    api.loadAssistantSession.mockResolvedValue({
      session: session("sess-2", "automation-a"),
      messages: [saved("turn-1"), saved("turn-2"), saved("turn-3")],
    });
    renderProvider({ automationId: "automation-a", mode: "detail" });
    await waitFor(() => {
      expect(screen.getByText("messages:user")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(screen.getByText("messages:user,user,user")).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(api.streamAssistantTurn).toHaveBeenCalledTimes(2);
    });

    expect(api.streamAssistantTurn.mock.calls.map(([input]) => input.lastTurnId)).toEqual([
      "turn-1",
      "turn-2",
    ]);
  });

  it("says on the message when the conversation has carried on in another tab, and drops a refused message when the next is sent", async () => {
    const user = userEvent.setup();
    api.createAssistantSession.mockResolvedValue(session("sess-1"));
    api.streamAssistantTurn.mockImplementation(async function* () {
      yield* [];
      throw new AssistantSessionOutOfDateError();
    });
    renderProvider();

    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(screen.getByText(/status:idle .*failure:out_of_date/)).toBeTruthy();
    });
    expect(screen.getByText("messages:user")).toBeTruthy();
    expect(screen.getByText("failed:0")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(api.streamAssistantTurn).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByText(/status:idle .*failure:out_of_date/)).toBeTruthy();
    });
    expect(screen.getByText("messages:user")).toBeTruthy();
  });
});
