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
import { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { updateWorkspaceAutomationSetup } from "@/lib/agents/workspace-automation-assistant";
import type { WorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import {
  createDefaultWorkspaceAutomationFormState,
  type WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";

import { AssistantTurnInProgressError } from "./automation-assistant-api";
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
}));

vi.mock("./automation-assistant-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./automation-assistant-api")>();
  return { ...actual, ...api };
});

vi.mock("@/components/app-shell/store/app-shell-store-context", () => ({
  useOptionalAppShellStore: () => ({ chatDock: { setPanelOpen: api.setPanelOpen } }),
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
      <p>{`status:${assistant.status} open:${assistant.open} calls:${assistant.appliedCallCount} changes:${assistant.appliedChangeCount} error:${assistant.error ?? "none"}`}</p>
      <p>{`messages:${assistant.messages.map((message) => message.senderType).join(",")}`}</p>
      <button type="button" onClick={() => assistant.send("Post a weekly summary")}>
        Send
      </button>
      <button type="button" onClick={assistant.startOver}>
        Start over
      </button>
    </div>
  );
}

function renderProvider(
  props: Partial<React.ComponentProps<typeof AutomationAssistantProvider>> = {},
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
  const view = render(<Harness connectionsSettled />);
  return { ...view, changes, Harness };
}

afterEach(() => {
  vi.clearAllMocks();
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

  it("sends a handed-over request once the integrations are known", async () => {
    api.createAssistantSession.mockResolvedValue(session("sess-1"));
    api.streamAssistantTurn.mockImplementation(async function* () {});
    api.loadAssistantSession.mockResolvedValue({ session: session("sess-1"), messages: [] });
    const { Harness, rerender } = renderProvider({ initialPrompt: "Post a weekly summary" });
    rerender(<Harness connectionsSettled={false} />);

    expect(api.streamAssistantTurn).not.toHaveBeenCalled();

    rerender(<Harness connectionsSettled />);

    await waitFor(() => {
      expect(api.streamAssistantTurn).toHaveBeenCalledTimes(1);
    });
    expect(api.streamAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Post a weekly summary", sessionId: "sess-1" }),
    );
  });

  it("says when a turn is already running", async () => {
    const user = userEvent.setup();
    api.createAssistantSession.mockResolvedValue(session("sess-1"));
    api.streamAssistantTurn.mockImplementation(async function* () {
      throw new AssistantTurnInProgressError();
    });
    renderProvider();

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText(/error:turn_in_progress/)).toBeTruthy();
    });
    expect(screen.getByText(/status:idle/)).toBeTruthy();
  });
});
