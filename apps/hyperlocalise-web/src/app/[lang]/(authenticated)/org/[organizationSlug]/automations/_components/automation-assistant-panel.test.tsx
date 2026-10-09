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
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  AutomationAssistantLayout,
  AutomationAssistantOpenButton,
  AutomationAssistantPanel,
} from "./automation-assistant-panel";
import {
  AutomationAssistantContext,
  type AutomationAssistantValue,
} from "./automation-assistant-provider";

vi.mock("@/lib/billing/use-ai-features-access", () => ({
  useAiFeaturesAccess: () => ({ status: "available" }),
}));

vi.mock("./automation-assistant-prompt", () => ({
  AutomationAssistantPrompt: ({
    organizationSlug,
    pending,
  }: {
    organizationSlug: string;
    pending?: boolean;
  }) => <p>{`prompt for ${organizationSlug}${pending ? " (closed)" : ""}`}</p>,
}));

const TOOL = "tool-update_automation_setup";

function assistant(overrides: Partial<AutomationAssistantValue> = {}): AutomationAssistantValue {
  return {
    organizationSlug: "acme",
    mode: "detail",
    automationName: "Weekly digest",
    open: true,
    setOpen: () => undefined,
    status: "idle",
    working: false,
    failure: null,
    session: null,
    messages: [],
    streaming: null,
    send: () => undefined,
    startOver: () => undefined,
    appliedCallCount: 0,
    appliedChangeCount: 0,
    steps: [],
    ...overrides,
  };
}

function showStreaming(parts: UIMessage["parts"]) {
  return render(
    <IntlProvider locale="en">
      <AutomationAssistantContext.Provider
        value={assistant({
          status: "streaming",
          working: true,
          streaming: { id: "stream-1", role: "assistant", parts },
        })}
      >
        <AutomationAssistantPanel />
      </AutomationAssistantContext.Provider>
    </IntlProvider>,
  );
}

function page(value: AutomationAssistantValue | null) {
  return (
    <IntlProvider locale="en">
      <AutomationAssistantContext.Provider value={value}>
        <AutomationAssistantLayout>
          <p>the form</p>
          <AutomationAssistantOpenButton />
        </AutomationAssistantLayout>
      </AutomationAssistantContext.Provider>
    </IntlProvider>
  );
}

describe("AutomationAssistantPanel", () => {
  it("shows one spinner while the setup tool runs", () => {
    showStreaming([
      { type: TOOL, toolCallId: "call_1", state: "input-available", input: {} },
    ] as UIMessage["parts"]);

    expect(screen.getByText("Updating the setup…")).toBeTruthy();
    expect(screen.queryByText("Working…")).toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("says it is working before the tool starts and after it finishes", () => {
    const { unmount } = showStreaming([]);
    expect(screen.getByText("Working…")).toBeTruthy();
    unmount();

    showStreaming([
      {
        type: TOOL,
        toolCallId: "call_1",
        state: "output-available",
        input: {},
        output: { applied: true, changes: [{ kind: "name", name: "Weekly digest" }] },
      },
    ] as UIMessage["parts"]);

    expect(screen.getByRole("button", { name: "Updated the setup · 1 change" })).toBeTruthy();
    expect(screen.getByText("Working…")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("what the panel says a turn did", () => {
  function show(value: AutomationAssistantValue) {
    return render(
      <IntlProvider locale="en">
        <AutomationAssistantContext.Provider value={value}>
          <AutomationAssistantPanel />
        </AutomationAssistantContext.Provider>
      </IntlProvider>,
    );
  }

  const reply = (parts: UIMessage["parts"] | null, text = "") => ({
    id: "m1",
    conversationId: "s1",
    senderType: "agent" as const,
    senderEmail: null,
    text,
    parts,
    attachments: null,
    createdAt: "2026-10-09T00:00:00.000Z",
  });

  it("says nothing changed under a finished reply that never called the tool, whatever the reply claims", () => {
    show(
      assistant({
        messages: [reply([{ type: "text", text: "I have removed the skills." }])],
      }),
    );

    expect(screen.getByText("I have removed the skills.")).toBeTruthy();
    expect(screen.getByText("No changes made to the setup")).toBeTruthy();
    expect(screen.queryByText(/changes are on the page/)).toBeNull();
  });

  it("does not say so while the reply is still being written", () => {
    showStreaming([{ type: "text", text: "Let me" }] as UIMessage["parts"]);

    expect(screen.queryByText("No changes made to the setup")).toBeNull();
  });

  it("leaves it to the call's own line when the tool was called", () => {
    show(
      assistant({
        messages: [
          reply([
            {
              type: TOOL,
              toolCallId: "call_1",
              state: "output-available",
              input: {},
              output: { applied: true, changes: [{ kind: "name", name: "Weekly digest" }] },
            },
            { type: "text", text: "Named it." },
          ] as UIMessage["parts"]),
        ],
      }),
    );

    expect(screen.getByRole("button", { name: "Updated the setup · 1 change" })).toBeTruthy();
    expect(screen.queryByText("No changes made to the setup")).toBeNull();
  });

  it("says above the person's message what they changed on the page before sending it", () => {
    show(
      assistant({
        messages: [
          {
            ...reply([
              { type: "data-page-edits", data: { edits: [{ kind: "name", name: "Old name" }] } },
            ] as UIMessage["parts"]),
            senderType: "user",
            text: "Rename it again",
          },
        ],
      }),
    );

    expect(screen.getByRole("button", { name: "You edited the setup · 1 change" })).toBeTruthy();
    expect(screen.getByText("Rename it again")).toBeTruthy();
  });

  it("gives the message box the workspace, which its upgrade link is built from", () => {
    show(assistant({ organizationSlug: "acme" }));

    expect(screen.getByText("prompt for acme")).toBeTruthy();
  });

  it("takes no message while a saved automation's conversation loads or a turn runs", () => {
    const { unmount } = show(assistant({ status: "loading" }));
    expect(screen.getByText("prompt for acme (closed)")).toBeTruthy();
    unmount();

    show(assistant({ status: "streaming", working: true }));
    expect(screen.getByText("prompt for acme (closed)")).toBeTruthy();
  });

  it("puts what went wrong under the message it went wrong for", () => {
    const sent = { ...reply(null), senderType: "user" as const };
    show(
      assistant({
        messages: [
          { ...sent, id: "m1", text: "Make it weekly" },
          { ...sent, id: "m2", text: "And email it" },
        ],
        failure: { messageId: "m2", reason: "out_of_date" },
      }),
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("carried on in another tab or window");
    expect(alert.parentElement?.textContent).toContain("And email it");
    expect(alert.parentElement?.textContent).not.toContain("Make it weekly");
  });

  it("says the changes are on the page and unsaved only while the page counts some", () => {
    const { unmount } = show(assistant({ mode: "detail", appliedCallCount: 1 }));
    expect(
      screen.getByText(
        "The assistant’s changes are on the page. Undo takes them back. Nothing is saved until you click Save.",
      ),
    ).toBeTruthy();
    unmount();

    const created = show(assistant({ mode: "create", appliedCallCount: 2 }));
    expect(screen.getByText(/Nothing is saved until you click Create automation\./)).toBeTruthy();
    created.unmount();

    const saved = show(assistant({ appliedCallCount: 0 }));
    expect(screen.queryByText(/changes are on the page/)).toBeNull();
    saved.unmount();

    show(assistant({ appliedCallCount: 1, working: true, status: "streaming" }));
    expect(screen.queryByText(/changes are on the page/)).toBeNull();
  });
});

describe("AutomationAssistantLayout", () => {
  it("opens the panel beside the form from the form's own button, and closes it from there too", async () => {
    const setOpen = vi.fn();
    const view = render(page(assistant({ open: false, setOpen })));

    expect(screen.getByText("the form")).toBeTruthy();
    expect(screen.queryByRole("complementary")).toBeNull();
    const closed = screen.getByRole("button", { name: "Configure with assistant" });
    expect(closed.getAttribute("aria-pressed")).toBe("false");

    await userEvent.click(closed);
    expect(setOpen).toHaveBeenCalledWith(true);

    view.rerender(page(assistant({ open: true, setOpen })));
    expect(
      within(screen.getByRole("complementary")).getByRole("region", {
        name: "Automation assistant",
      }),
    ).toBeTruthy();
    const opened = screen.getByRole("button", { name: "Configure with assistant" });
    expect(opened.getAttribute("aria-pressed")).toBe("true");

    await userEvent.click(opened);
    expect(setOpen).toHaveBeenLastCalledWith(false);
  });

  it("shows the form and no button for an automation the assistant is not offered on", () => {
    render(page(null));

    expect(screen.getByText("the form")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Configure with assistant" })).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
