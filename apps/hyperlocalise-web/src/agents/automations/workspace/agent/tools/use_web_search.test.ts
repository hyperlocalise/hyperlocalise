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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automations";

import type { WorkspaceOrchestratorSession } from "../context";
import { createUseWebSearchTool, resolveWorkspaceWebSearchGatewayTools } from "./use_web_search";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  withAgentRuntimeUsageMetering: vi.fn(
    async (input: { run: () => Promise<unknown> }) => input.run(),
  ),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");

  return {
    ...actual,
    ToolLoopAgent: vi.fn(function ToolLoopAgent() {
      return { generate: mocks.generate };
    }),
  };
});

vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  extractGenerateResultTokenUsage: vi.fn(),
  withAgentRuntimeUsageMetering: (...args: unknown[]) =>
    mocks.withAgentRuntimeUsageMetering(...args),
}));

function session(
  toolConfig: WorkspaceAutomationRecord["toolConfig"] = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: "Web search automation",
    instructions: "Research local competitors.",
    projectId: null,
    triggerConfig: { mode: "manual" },
    repositoryTarget: { kind: "none" },
    toolConfig,
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies WorkspaceAutomationRecord;

  const run = {
    id: "run-1",
    automationId: automation.id,
    organizationId: automation.organizationId,
    triggerSource: "manual",
    status: "running",
    inputSnapshot: {},
    outputSummary: {},
    error: null,
    githubRepositoryAutomationJobId: null,
    idempotencyKey: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies WorkspaceAutomationRunRecord;

  return {
    organizationId: automation.organizationId,
    automation,
    run,
    plan: { tools: ["use_web_search"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

describe("resolveWorkspaceWebSearchGatewayTools", () => {
  it("exposes both Gateway search tools for auto", () => {
    expect(Object.keys(resolveWorkspaceWebSearchGatewayTools("auto")).toSorted()).toEqual([
      "exa_search",
      "perplexity_search",
    ]);
  });

  it("exposes only Perplexity or Exa when that provider is selected", () => {
    expect(Object.keys(resolveWorkspaceWebSearchGatewayTools("perplexity"))).toEqual([
      "perplexity_search",
    ]);
    expect(Object.keys(resolveWorkspaceWebSearchGatewayTools("exa"))).toEqual(["exa_search"]);
  });
});

describe("createUseWebSearchTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when Web Search is not enabled on the automation", async () => {
    await expect(
      createUseWebSearchTool(session()).execute!(
        { objective: "Find competitor landing pages" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("web_search_not_configured");

    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("runs a nested search agent and stores the summary", async () => {
    mocks.generate.mockResolvedValue({ text: "  Found three local competitors.  " });
    const current = session({
      webSearch: { enabled: true, provider: "exa" },
    });

    const result = await createUseWebSearchTool(current).execute!(
      { objective: "Find competitor landing pages" },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    expect(result).toEqual({
      summary: "Found three local competitors.",
      provider: "exa",
      toolNames: ["exa_search"],
    });
    expect(current.stepResults.use_web_search).toEqual(result);
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
});
