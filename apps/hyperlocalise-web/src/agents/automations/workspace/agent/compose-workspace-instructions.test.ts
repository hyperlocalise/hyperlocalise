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
import { describe, expect, it } from "vite-plus/test";

import { composeWorkspaceAutomationInstructions } from "./compose-workspace-instructions";

describe("composeWorkspaceAutomationInstructions", () => {
  it("nudges the agent toward recall_memory when it's in the plan", () => {
    const instructions = composeWorkspaceAutomationInstructions({
      triggerMode: "manual",
      plan: { tools: ["notify_slack", "recall_memory"] },
      userOverride: "Notify the team.",
    });

    expect(instructions).toContain("recall_memory tool");
    expect(instructions).not.toContain("save_memory tool");
  });

  it("nudges the agent toward save_memory when it's in the plan", () => {
    const instructions = composeWorkspaceAutomationInstructions({
      triggerMode: "manual",
      plan: { tools: ["recall_memory", "save_memory"] },
      userOverride: "Notify the team.",
    });

    expect(instructions).toContain("recall_memory tool");
    expect(instructions).toContain("save_memory tool");
  });

  it("includes the Slack notifications skill when notify_slack is planned", () => {
    const instructions = composeWorkspaceAutomationInstructions({
      triggerMode: "manual",
      plan: { tools: ["notify_slack"] },
      userOverride: "Notify the team.",
    });

    expect(instructions).toContain("## Slack notifications");
    expect(instructions).toContain("Customer format first");
    expect(instructions).not.toContain("recall_memory tool");
    expect(instructions).not.toContain("save_memory tool");
  });

  it("tells the orchestrator how to call use_crowdin when it is planned", () => {
    const instructions = composeWorkspaceAutomationInstructions({
      triggerMode: "scheduled",
      plan: { tools: ["use_github_repository", "use_crowdin", "notify_slack"] },
      userOverride: "Review user-facing strings.",
    });

    expect(instructions).toContain("When calling use_crowdin");
    expect(instructions).toContain("search concordance");
  });

  it("omits the Slack notifications skill when notify_slack is not planned", () => {
    const instructions = composeWorkspaceAutomationInstructions({
      triggerMode: "manual",
      plan: { tools: ["recall_memory", "save_memory"] },
      userOverride: "Notify the team.",
    });

    expect(instructions).not.toContain("## Slack notifications");
  });
});
