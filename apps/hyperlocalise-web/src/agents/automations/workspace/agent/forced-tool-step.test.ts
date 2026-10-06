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

import { forcedWorkspaceOrchestratorStep } from "./forced-tool-step";

describe("forcedWorkspaceOrchestratorStep", () => {
  it("forces planned tools in order and disables tools past the plan", () => {
    const planTools = ["run_github_workflows", "notify_slack"] as const;

    expect(forcedWorkspaceOrchestratorStep(planTools, 0)).toEqual({
      activeTools: ["run_github_workflows"],
      toolChoice: { type: "tool", toolName: "run_github_workflows" },
    });
    expect(forcedWorkspaceOrchestratorStep(planTools, 1)).toEqual({
      activeTools: ["notify_slack"],
      toolChoice: { type: "tool", toolName: "notify_slack" },
    });
    expect(forcedWorkspaceOrchestratorStep(planTools, 2)).toEqual({ toolChoice: "none" });
  });

  it("reaches every tool in a large plan", () => {
    // Regression for a Codex finding: a fixed step cap once dropped the last planned tool (often
    // the Slack/email notification) from a seven-tool plan while the run still reported success.
    const planTools = [
      "recall_memory",
      "use_github_repository",
      "run_github_workflows",
      "create_native_tms_job",
      "assign_translate_with_agent",
      "use_semrush",
      "notify_slack",
    ] as const;

    expect(forcedWorkspaceOrchestratorStep(planTools, 6)).toEqual({
      activeTools: ["notify_slack"],
      toolChoice: { type: "tool", toolName: "notify_slack" },
    });
  });

  it("forces save_memory like any other planned tool, positioned before notifications", () => {
    // Regression for a Codex finding: an "auto" save_memory step let the loop end when the model
    // skipped it, so the notify_slack step planned after it never ran.
    const planTools = [
      "recall_memory",
      "run_github_workflows",
      "save_memory",
      "notify_slack",
    ] as const;

    expect(forcedWorkspaceOrchestratorStep(planTools, 2)).toEqual({
      activeTools: ["save_memory"],
      toolChoice: { type: "tool", toolName: "save_memory" },
    });
    expect(forcedWorkspaceOrchestratorStep(planTools, 3)).toEqual({
      activeTools: ["notify_slack"],
      toolChoice: { type: "tool", toolName: "notify_slack" },
    });
  });
});
