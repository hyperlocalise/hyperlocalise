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
import { err } from "@/lib/primitives/result/results";

import type { WorkspaceOrchestratorSession } from "../context";
import { createUseAhrefsTool } from "./use_ahrefs";

const mocks = vi.hoisted(() => ({
  loadAhrefsPipesApiKey: vi.fn(),
  createAhrefsMcpClient: vi.fn(),
}));

vi.mock("@/lib/ahrefs/pipes", () => ({
  loadAhrefsPipesApiKey: (...args: unknown[]) => mocks.loadAhrefsPipesApiKey(...args),
}));

vi.mock("@/lib/ahrefs/mcp-client", () => ({
  createAhrefsMcpClient: (...args: unknown[]) => mocks.createAhrefsMcpClient(...args),
  listAhrefsMcpTools: vi.fn(),
}));

function session(
  toolConfig: WorkspaceAutomationRecord["toolConfig"] = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: "Ahrefs automation",
    instructions: "",
    projectId: null,
    triggerConfig: { mode: "manual" },
    repositoryTarget: { kind: "none" },
    toolConfig,
    model: "openai/gpt-5.6-luna",
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
    plan: { tools: ["use_ahrefs"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

describe("createUseAhrefsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when Ahrefs is not configured on the automation", async () => {
    await expect(
      createUseAhrefsTool(session()).execute!(
        { objective: "Find backlink metrics" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("ahrefs_not_configured");

    await expect(
      createUseAhrefsTool(
        session({
          ahrefs: { enabled: true },
        }),
      ).execute!(
        { objective: "Find backlink metrics" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("ahrefs_not_configured");

    expect(mocks.loadAhrefsPipesApiKey).not.toHaveBeenCalled();
    expect(mocks.createAhrefsMcpClient).not.toHaveBeenCalled();
  });

  it("rejects missing Ahrefs Pipes credentials before connecting to MCP", async () => {
    mocks.loadAhrefsPipesApiKey.mockResolvedValue(err({ code: "ahrefs_not_connected" }));

    await expect(
      createUseAhrefsTool(
        session({
          ahrefs: {
            enabled: true,
            workosUserId: "user_workos",
          },
        }),
      ).execute!(
        { objective: "Find backlink metrics" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("ahrefs_not_connected");

    expect(mocks.loadAhrefsPipesApiKey).toHaveBeenCalledWith({
      localOrganizationId: "org-1",
      workosUserId: "user_workos",
    });
    expect(mocks.createAhrefsMcpClient).not.toHaveBeenCalled();
  });

  it("rejects Ahrefs Pipes credentials that need reauthorization", async () => {
    mocks.loadAhrefsPipesApiKey.mockResolvedValue(
      err({ code: "ahrefs_pipes_needs_reauthorization" }),
    );

    await expect(
      createUseAhrefsTool(
        session({
          ahrefs: {
            enabled: true,
            workosUserId: "user_workos",
          },
        }),
      ).execute!(
        { objective: "Find backlink metrics" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("ahrefs_pipes_needs_reauthorization");

    expect(mocks.createAhrefsMcpClient).not.toHaveBeenCalled();
  });
});
