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
} from "@/lib/agents/workspace-automation-types";
import { err, ok } from "@/lib/primitives/result/results";

import type { WorkspaceOrchestratorSession } from "../context";
import { createUseBitbucketRepositoryTool } from "./use_bitbucket_repository";

const mocks = vi.hoisted(() => ({
  loadBitbucketRepositoryContext: vi.fn(),
  createBitbucketRepositorySandbox: vi.fn(),
  stopBitbucketRepositorySandbox: vi.fn(),
  toolLoopGenerate: vi.fn(),
  withAgentRuntimeUsageMetering: vi.fn(),
  composeBitbucketRepoInstructions: vi.fn((..._args: unknown[]) => "instructions"),
}));

vi.mock("@/lib/database/client", () => ({
  db: {},
}));

vi.mock("@/lib/bitbucket/repository-context", () => ({
  loadBitbucketRepositoryContext: (...args: unknown[]) =>
    mocks.loadBitbucketRepositoryContext(...args),
}));

vi.mock("@/lib/bitbucket/bitbucket-repository-sandbox", () => ({
  createBitbucketRepositorySandbox: (...args: unknown[]) =>
    mocks.createBitbucketRepositorySandbox(...args),
  stopBitbucketRepositorySandbox: (...args: unknown[]) =>
    mocks.stopBitbucketRepositorySandbox(...args),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    ToolLoopAgent: class {
      generate = mocks.toolLoopGenerate;
    },
    isStepCount: vi.fn(() => () => false),
  };
});

vi.mock("@/lib/agent-runtime/tools/registry", () => ({
  buildTools: vi.fn(() => ({})),
}));

vi.mock("@/lib/agent-runtime/tools/manifest", () => ({
  filterToolSetByNames: vi.fn((tools: unknown) => tools),
  repositoryWorkflowToolNames: [],
}));

vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  extractGenerateResultTokenUsage: vi.fn(),
  withAgentRuntimeUsageMetering: (...args: unknown[]) =>
    mocks.withAgentRuntimeUsageMetering(...args),
}));

vi.mock("@/lib/tools/types", () => ({
  ensureAgentSession: vi.fn(),
}));

vi.mock("@/agents/automations/workspace/agent/workspace-template-manifest", () => ({
  composeBitbucketRepoInstructions: (...args: unknown[]) =>
    mocks.composeBitbucketRepoInstructions(...args),
}));

vi.mock("@/lib/agents/workspace-automation-types", () => ({
  resolveWorkspaceAutomationModel: vi.fn(() => "model"),
}));

const bitbucketContext = {
  resolved: true as const,
  provider: "bitbucket" as const,
  repositoryUuid: "{repo-uuid}",
  repositoryFullName: "acme/web",
  branch: "main",
};

function session(
  overrides: {
    repositoryTarget?: WorkspaceAutomationRecord["repositoryTarget"];
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
    triggerSource?: WorkspaceAutomationRunRecord["triggerSource"];
  } = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "Bitbucket review",
    instructions: "Review localisation impact",
    projectId: null,
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: overrides.repositoryTarget ?? {
      kind: "bitbucket",
      bitbucketRepositoryFullName: "acme/web",
    },
    toolConfig: overrides.toolConfig ?? {
      bitbucket: { enabled: true },
    },
    model: "openai/gpt-6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies WorkspaceAutomationRecord;

  const run = {
    id: "run-1",
    automationId: automation.id,
    organizationId: automation.organizationId,
    triggerSource: overrides.triggerSource ?? "scheduled",
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
    plan: { tools: ["use_bitbucket_repository"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createUseBitbucketRepositoryTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadBitbucketRepositoryContext.mockResolvedValue(ok(bitbucketContext));
    mocks.createBitbucketRepositorySandbox.mockResolvedValue("sbx-bitbucket-1");
    mocks.stopBitbucketRepositorySandbox.mockResolvedValue(undefined);
    mocks.toolLoopGenerate.mockResolvedValue({ text: "Bitbucket digest ready" });
    mocks.withAgentRuntimeUsageMetering.mockImplementation(
      async (input: { run: () => Promise<unknown> }) => input.run(),
    );
  });

  it("rejects when the automation has no Bitbucket repository target", async () => {
    await expect(
      createUseBitbucketRepositoryTool(session({ repositoryTarget: { kind: "none" } })).execute!(
        {},
        toolOptions,
      ),
    ).rejects.toThrow("bitbucket_repository_target_required");

    expect(mocks.loadBitbucketRepositoryContext).not.toHaveBeenCalled();
    expect(mocks.createBitbucketRepositorySandbox).not.toHaveBeenCalled();
  });

  it.each([
    ["bitbucket_not_found", "bitbucket_repository_not_found"],
    ["bitbucket_forbidden", "bitbucket_repository_not_found"],
    ["bitbucket_needs_reconnect", "bitbucket_needs_reconnect"],
    ["bitbucket_unauthorized", "bitbucket_needs_reconnect"],
    ["bitbucket_request_failed", "bitbucket_request_failed"],
    ["bitbucket_not_connected", "bitbucket_not_connected"],
  ])("reports %s as %s without cloning", async (code, expected) => {
    mocks.loadBitbucketRepositoryContext.mockResolvedValue(err({ code, message: "x", status: 0 }));

    await expect(
      createUseBitbucketRepositoryTool(session()).execute!({}, toolOptions),
    ).rejects.toThrow(expected);

    expect(mocks.createBitbucketRepositorySandbox).not.toHaveBeenCalled();
  });

  it("runs a scheduled lookback review and stops the sandbox", async () => {
    const current = session();

    const payload = await createUseBitbucketRepositoryTool(current).execute!({}, toolOptions);

    expect(mocks.loadBitbucketRepositoryContext).toHaveBeenCalledWith({
      localOrganizationId: "org-1",
      repositoryFullName: "acme/web",
    });
    expect(mocks.createBitbucketRepositorySandbox).toHaveBeenCalledWith({
      localOrganizationId: "org-1",
      bitbucketContext,
      cloneDepth: 50,
    });
    expect(mocks.composeBitbucketRepoInstructions).toHaveBeenCalledWith(
      expect.objectContaining({
        userOverride: "Review localisation impact",
        dynamicSections: expect.arrayContaining([
          "Repository: acme/web.",
          "Branch: main.",
          "Lookback window: 24 hours.",
          "Sandbox id: sbx-bitbucket-1.",
        ]),
      }),
    );
    expect(payload).toEqual({
      digest: "Bitbucket digest ready",
      repositoryFullName: "acme/web",
      branch: "main",
      lookbackHours: 24,
    });
    expect(current.terminalStatus).toBe("succeeded");
    expect(current.stepResults.use_bitbucket_repository).toEqual(payload);
    expect(mocks.stopBitbucketRepositorySandbox).toHaveBeenCalledWith("sbx-bitbucket-1");
  });

  it("marks the session failed and still stops the sandbox when the agent throws", async () => {
    mocks.toolLoopGenerate.mockRejectedValue(new Error("agent_timeout"));
    const current = session();

    await expect(
      createUseBitbucketRepositoryTool(current).execute!({}, toolOptions),
    ).rejects.toThrow("agent_timeout");

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("agent_timeout");
    expect(mocks.stopBitbucketRepositorySandbox).toHaveBeenCalledWith("sbx-bitbucket-1");
  });
});
