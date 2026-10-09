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

import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import {
  AutomationAssistantContext,
  type AutomationAssistantValue,
} from "./automation-assistant-provider";
import { AutomationAssistantSummary } from "./automation-assistant-summary";

function show(overrides: Partial<AutomationAssistantValue>) {
  const value: AutomationAssistantValue = {
    mode: "create",
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
  return render(
    <IntlProvider locale="en">
      <AutomationAssistantContext.Provider value={value}>
        <AutomationAssistantSummary organizationSlug="acme" />
      </AutomationAssistantContext.Provider>
    </IntlProvider>,
  );
}

const WORKING = "The assistant is working on this setup";
const DONE = "The assistant set up this automation";

describe("AutomationAssistantSummary", () => {
  it("is nothing before the assistant has done anything", () => {
    const { container } = show({});

    expect(container.textContent).toBe("");
  });

  it("says the assistant is working until a change lands", () => {
    show({ working: true, status: "streaming" });

    expect(screen.getByText(WORKING)).toBeTruthy();
    expect(screen.queryByText(DONE)).toBeNull();
  });

  it("says what happened as soon as the form has changed, and no longer that it is working", () => {
    // The reply is still being written in the panel; the form is already done.
    show({ working: true, status: "streaming", appliedCallCount: 1, appliedChangeCount: 4 });

    expect(screen.getByText(DONE)).toBeTruthy();
    expect(screen.getByText("4 changes")).toBeTruthy();
    expect(screen.queryByText(WORKING)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps saying what happened after the turn ends", () => {
    show({ appliedCallCount: 1, appliedChangeCount: 4 });

    expect(screen.getByText(DONE)).toBeTruthy();
    expect(screen.queryByText(WORKING)).toBeNull();
  });
});
