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
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { AutomationAssistantPanel } from "./automation-assistant-panel";
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

function showStreaming(parts: UIMessage["parts"]) {
  const value: AutomationAssistantValue = {
    mode: "detail",
    automationName: "Weekly digest",
    open: true,
    setOpen: () => undefined,
    status: "streaming",
    working: true,
    error: null,
    session: null,
    messages: [],
    streaming: { id: "stream-1", role: "assistant", parts },
    send: () => undefined,
    startOver: () => undefined,
    appliedCallCount: 0,
    appliedChangeCount: 0,
    steps: [],
  };
  return render(
    <IntlProvider locale="en">
      <AutomationAssistantContext.Provider value={value}>
        <AutomationAssistantPanel />
      </AutomationAssistantContext.Provider>
    </IntlProvider>,
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
