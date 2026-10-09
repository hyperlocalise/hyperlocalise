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
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import type { AutomationSetupCallSummary } from "@/lib/agents/workspace-automation-assistant";

import {
  AutomationAssistantPageEdits,
  AutomationAssistantToolCall,
} from "./automation-assistant-tool-call";

function show(summary: AutomationSetupCallSummary) {
  return render(
    <IntlProvider locale="en">
      <AutomationAssistantToolCall summary={summary} />
    </IntlProvider>,
  );
}

describe("AutomationAssistantPageEdits", () => {
  it("opens to list what the person changed on the page themselves", async () => {
    render(
      <IntlProvider locale="en">
        <AutomationAssistantPageEdits
          edits={[
            { kind: "name", name: "Competitor news brief" },
            { kind: "name", name: "" },
            { kind: "skill_removed", skillName: "Post results to Slack" },
            { kind: "status", active: false },
            { kind: "other" },
          ]}
        />
      </IntlProvider>,
    );

    const line = screen.getByRole("button", { name: "You edited the setup · 5 changes" });
    expect(screen.queryByRole("listitem")).toBeNull();

    await userEvent.click(line);

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Name set to “Competitor news brief”",
      "Name cleared",
      "Removed skill: Post results to Slack",
      "Switched off",
      "Other settings changed",
    ]);
  });

  it("is nothing when the person changed nothing", () => {
    const { container } = render(
      <IntlProvider locale="en">
        <AutomationAssistantPageEdits edits={[]} />
      </IntlProvider>,
    );

    expect(container.textContent).toBe("");
  });
});

describe("AutomationAssistantToolCall", () => {
  it("opens to list what the call changed and what it left out", async () => {
    show({
      state: "done",
      changes: [
        { kind: "name", name: "Weekly digest" },
        { kind: "instructions", cleared: false },
        {
          kind: "trigger",
          trigger: {
            mode: "scheduled",
            cadence: "weekly",
            hour: 9,
            dayOfWeek: 1,
            timeZone: "Australia/Sydney",
          },
        },
        {
          kind: "trigger",
          trigger: { mode: "github", events: ["pull_request"], branches: ["main"] },
        },
        { kind: "skill_added", skillName: "Research the web" },
        { kind: "skill_removed", skillName: "Email the results" },
        {
          kind: "skill_not_added",
          skillName: "Post to Slack",
          reason: "needs_connection",
          integrations: ["slack"],
        },
        {
          kind: "skill_not_added",
          skillName: "Comment on pull request",
          reason: "wrong_trigger",
          integrations: [],
        },
      ],
    });

    // What was left out is listed and not counted as a change.
    const line = screen.getByRole("button", { name: "Updated the setup · 6 changes" });
    expect(screen.queryByText("Name set to “Weekly digest”")).toBeNull();

    await userEvent.click(line);

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Name set to “Weekly digest”",
      "Instructions rewritten",
      "Trigger: Every Monday at 09:00 · Australia/Sydney",
      "Trigger: A pull request is made · main",
      "Added skill: Research the web",
      "Removed skill: Email the results",
      "Not added: Post to Slack. Connect Slack first.",
      "Not added: Comment on pull request. It cannot run on this trigger.",
    ]);
  });

  it("says nothing changed, and still lists why, when everything asked for was left out", async () => {
    show({
      state: "done",
      changes: [
        {
          kind: "skill_not_added",
          skillName: "Post to Slack",
          reason: "needs_connection",
          integrations: ["slack"],
        },
      ],
    });

    await userEvent.click(screen.getByRole("button", { name: "No changes made to the setup" }));

    expect(screen.getByText("Not added: Post to Slack. Connect Slack first.")).toBeTruthy();
  });

  it("is a plain line when there is nothing to list", () => {
    const { unmount } = show({ state: "done", changes: [] });
    expect(screen.getByText("No changes made to the setup")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    unmount();

    show({ state: "done", changes: null });
    expect(screen.getByText("Updated the setup")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says when a call is running and when it failed", () => {
    const { unmount } = show({ state: "running" });
    expect(screen.getByText("Updating the setup…")).toBeTruthy();
    unmount();

    show({ state: "failed" });
    expect(screen.getByText("The setup could not be updated")).toBeTruthy();
  });
});
