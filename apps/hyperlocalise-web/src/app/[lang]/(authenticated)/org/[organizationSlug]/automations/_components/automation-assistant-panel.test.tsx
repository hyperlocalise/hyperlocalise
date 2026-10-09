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

import { AutomationAssistantLayout, AutomationAssistantPanel } from "./automation-assistant-panel";
import {
  AutomationAssistantContext,
  type AutomationAssistantValue,
} from "./automation-assistant-provider";

vi.mock("@/lib/billing/use-ai-features-access", () => ({
  useAiFeaturesAccess: () => ({ status: "available" }),
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
  it("folds the assistant to a strip on the page's edge, which opens the panel in its place", async () => {
    const setOpen = vi.fn();
    const view = render(page(assistant({ open: false, setOpen })));

    expect(screen.getByText("the form")).toBeTruthy();
    const edge = screen.getByRole("complementary");
    const strip = within(edge).getByRole("button", { name: "Assistant" });
    expect(strip.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "Automation assistant" })).toBeNull();

    await userEvent.click(strip);
    expect(setOpen).toHaveBeenCalledWith(true);

    view.rerender(page(assistant({ open: true, setOpen })));
    expect(
      within(screen.getByRole("complementary")).getByRole("region", {
        name: "Automation assistant",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Assistant" })).toBeNull();
  });

  it("shows in the strip that a turn is still running", () => {
    render(page(assistant({ open: false, working: true, status: "streaming" })));

    expect(within(screen.getByRole("complementary")).getByRole("status")).toBeTruthy();
  });

  it("shows the form and no strip for an automation the assistant is not offered on", () => {
    render(page(null));

    expect(screen.getByText("the form")).toBeTruthy();
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
