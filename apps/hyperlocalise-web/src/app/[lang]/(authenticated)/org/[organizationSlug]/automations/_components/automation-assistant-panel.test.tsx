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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { HeaderActionsStore } from "@/components/app-shell/store/header-actions-store";

import { AutomationAssistantLayout, AutomationAssistantPanel } from "./automation-assistant-panel";
import {
  AutomationAssistantContext,
  type AutomationAssistantValue,
} from "./automation-assistant-provider";

vi.mock("@/lib/billing/use-ai-features-access", () => ({
  useAiFeaturesAccess: () => ({ status: "available" }),
}));

const shell = vi.hoisted(() => ({ store: null as { headerActions: unknown } | null }));

vi.mock("@/components/app-shell/store/app-shell-store-context", () => ({
  useOptionalAppShellStore: () => shell.store,
}));

vi.mock("./automation-assistant-prompt", () => ({
  AutomationAssistantPrompt: () => null,
}));

const TOOL = "tool-update_automation_setup";

function assistant(overrides: Partial<AutomationAssistantValue> = {}): AutomationAssistantValue {
  return {
    mode: "detail",
    automationName: "Weekly digest",
    open: true,
    setOpen: () => undefined,
    status: "idle",
    working: false,
    error: null,
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
        </AutomationAssistantLayout>
      </AutomationAssistantContext.Provider>
    </IntlProvider>
  );
}

/** What the app's top bar would draw for the page. */
function topBar(headerActions: HeaderActionsStore) {
  return (
    <IntlProvider locale="en">
      {headerActions.orderedSlots.map((slot) => slot.render())}
    </IntlProvider>
  );
}

afterEach(() => {
  shell.store = null;
});

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

describe("AutomationAssistantLayout", () => {
  it("opens and closes the panel from one button in the app's top bar", async () => {
    const headerActions = new HeaderActionsStore();
    shell.store = { headerActions };
    const setOpen = vi.fn();
    const view = render(page(assistant({ open: false, setOpen })));

    expect(screen.getByText("the form")).toBeTruthy();
    expect(screen.queryByRole("complementary")).toBeNull();
    const bar = render(topBar(headerActions));
    const closed = screen.getByRole("button", { name: "Assistant" });
    expect(closed.getAttribute("aria-pressed")).toBe("false");

    await userEvent.click(closed);
    expect(setOpen).toHaveBeenCalledWith(true);

    view.rerender(page(assistant({ open: true, setOpen })));
    bar.rerender(topBar(headerActions));
    const opened = screen.getByRole("button", { name: "Assistant" });
    expect(opened.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("complementary")).toBeTruthy();

    await userEvent.click(opened);
    expect(setOpen).toHaveBeenLastCalledWith(false);
  });

  it("takes its button out of the top bar when the page is left", () => {
    const headerActions = new HeaderActionsStore();
    shell.store = { headerActions };
    const view = render(page(assistant({ open: false })));
    expect(headerActions.orderedSlots).toHaveLength(1);

    view.unmount();

    expect(headerActions.orderedSlots).toHaveLength(0);
  });

  it("shows the form and no button for an automation the assistant is not offered on", () => {
    const headerActions = new HeaderActionsStore();
    shell.store = { headerActions };

    render(page(null));

    expect(screen.getByText("the form")).toBeTruthy();
    expect(headerActions.orderedSlots).toHaveLength(0);
  });
});
