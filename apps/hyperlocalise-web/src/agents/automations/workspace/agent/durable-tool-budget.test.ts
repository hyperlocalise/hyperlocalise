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

import {
  REPOSITORY_AGENT_DURABLE_TIMEOUT_MS,
  WORKSPACE_GITHUB_JOB_DURABLE_POLL_MAX_MS,
  WORKSPACE_ORCHESTRATOR_DURABLE_TOOL_BUDGET_MS,
  WORKSPACE_ORCHESTRATOR_TOOL_BUDGET_MS,
} from "@/lib/agent-runtime/subagents/constants";

import { isRepositoryAgentToolName, workspaceOrchestratorDeadlineMs } from "./durable-tool-budget";

describe("isRepositoryAgentToolName", () => {
  it("recognizes only durable repository tools", () => {
    expect(isRepositoryAgentToolName("use_github_repository")).toBe(true);
    expect(isRepositoryAgentToolName("use_gitlab_repository")).toBe(true);
    expect(isRepositoryAgentToolName("run_github_workflows")).toBe(false);
    expect(isRepositoryAgentToolName("notify_slack")).toBe(false);
  });
});

describe("workspaceOrchestratorDeadlineMs", () => {
  it("uses the durable budget for repository and GitHub job tools", () => {
    expect(workspaceOrchestratorDeadlineMs(["use_github_repository"])).toBe(
      WORKSPACE_ORCHESTRATOR_DURABLE_TOOL_BUDGET_MS.use_github_repository,
    );
    expect(workspaceOrchestratorDeadlineMs(["use_gitlab_repository"])).toBe(
      WORKSPACE_ORCHESTRATOR_DURABLE_TOOL_BUDGET_MS.use_gitlab_repository,
    );
    expect(workspaceOrchestratorDeadlineMs(["run_github_workflows"])).toBe(
      WORKSPACE_ORCHESTRATOR_DURABLE_TOOL_BUDGET_MS.run_github_workflows,
    );
    expect(WORKSPACE_ORCHESTRATOR_DURABLE_TOOL_BUDGET_MS.use_github_repository).toBeGreaterThan(
      REPOSITORY_AGENT_DURABLE_TIMEOUT_MS,
    );
    expect(WORKSPACE_ORCHESTRATOR_DURABLE_TOOL_BUDGET_MS.run_github_workflows).toBeGreaterThan(
      WORKSPACE_GITHUB_JOB_DURABLE_POLL_MAX_MS,
    );
  });

  it("sums short-lived tools at the default step budget", () => {
    expect(workspaceOrchestratorDeadlineMs(["list_issues", "notify_slack"])).toBe(
      WORKSPACE_ORCHESTRATOR_TOOL_BUDGET_MS * 2,
    );
  });

  it("mixes durable and short-lived planned tools", () => {
    expect(workspaceOrchestratorDeadlineMs(["notify_slack", "use_github_repository"])).toBe(
      WORKSPACE_ORCHESTRATOR_TOOL_BUDGET_MS +
        WORKSPACE_ORCHESTRATOR_DURABLE_TOOL_BUDGET_MS.use_github_repository,
    );
  });
});
