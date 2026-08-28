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
import { createUseSemrushTool } from "./use_semrush";

const mocks = vi.hoisted(() => ({
  loadSemrushConnectionWithApiKey: vi.fn(),
  createSemrushMcpClient: vi.fn(),
}));

vi.mock("@/lib/semrush/connections", () => ({
  loadSemrushConnectionWithApiKey: (...args: unknown[]) =>
    mocks.loadSemrushConnectionWithApiKey(...args),
}));

vi.mock("@/lib/semrush/mcp-client", () => ({
  createSemrushMcpClient: (...args: unknown[]) => mocks.createSemrushMcpClient(...args),
  listSemrushMcpTools: vi.fn(),
}));

function session(
  toolConfig: WorkspaceAutomationRecord["toolConfig"] = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: "Semrush automation",
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
    plan: { tools: ["use_semrush"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

describe("createUseSemrushTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when Semrush is not configured on the automation", async () => {
    await expect(
      createUseSemrushTool(session()).execute!(
        { objective: "Find keyword volume" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("semrush_not_configured");

    await expect(
      createUseSemrushTool(
        session({
          semrush: { enabled: true },
        }),
      ).execute!(
        { objective: "Find keyword volume" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("semrush_not_configured");

    expect(mocks.loadSemrushConnectionWithApiKey).not.toHaveBeenCalled();
    expect(mocks.createSemrushMcpClient).not.toHaveBeenCalled();
  });

  it("rejects missing Semrush connections before connecting to MCP", async () => {
    mocks.loadSemrushConnectionWithApiKey.mockResolvedValue(
      err({ code: "semrush_connection_not_found" }),
    );

    await expect(
      createUseSemrushTool(
        session({
          semrush: {
            enabled: true,
            connectionId: "11111111-1111-4111-8111-111111111111",
          },
        }),
      ).execute!(
        { objective: "Find keyword volume" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("semrush_connection_not_found");

    expect(mocks.createSemrushMcpClient).not.toHaveBeenCalled();
  });

  it("rejects disabled or unvalidated Semrush connections before connecting to MCP", async () => {
    mocks.loadSemrushConnectionWithApiKey.mockResolvedValue(
      ok({
        connection: {
          id: "11111111-1111-4111-8111-111111111111",
          enabled: false,
          validationStatus: "valid",
        },
        apiKey: "semrush_test_key",
      }),
    );

    await expect(
      createUseSemrushTool(
        session({
          semrush: {
            enabled: true,
            connectionId: "11111111-1111-4111-8111-111111111111",
          },
        }),
      ).execute!(
        { objective: "Find keyword volume" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("semrush_not_connected");

    mocks.loadSemrushConnectionWithApiKey.mockResolvedValue(
      ok({
        connection: {
          id: "11111111-1111-4111-8111-111111111111",
          enabled: true,
          validationStatus: "unvalidated",
        },
        apiKey: "semrush_test_key",
      }),
    );

    await expect(
      createUseSemrushTool(
        session({
          semrush: {
            enabled: true,
            connectionId: "11111111-1111-4111-8111-111111111111",
          },
        }),
      ).execute!(
        { objective: "Find keyword volume" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("semrush_not_connected");

    expect(mocks.createSemrushMcpClient).not.toHaveBeenCalled();
  });
});
