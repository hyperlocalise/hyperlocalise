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
import { createUseZernioTool } from "./use_zernio";

const mocks = vi.hoisted(() => ({
  loadZernioConnectionWithApiKey: vi.fn(),
  createZernioAdsToolSet: vi.fn(),
}));

vi.mock("@/lib/zernio/connections", () => ({
  loadZernioConnectionWithApiKey: (...args: unknown[]) =>
    mocks.loadZernioConnectionWithApiKey(...args),
}));

vi.mock("@/lib/zernio/agent-tools", () => ({
  createZernioAdsToolSet: (...args: unknown[]) => mocks.createZernioAdsToolSet(...args),
}));

function session(
  toolConfig: WorkspaceAutomationRecord["toolConfig"] = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: "Zernio automation",
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
    plan: { tools: ["use_zernio"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

describe("createUseZernioTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when Zernio is not configured on the automation", async () => {
    await expect(
      createUseZernioTool(session()).execute!(
        { objective: "Create a paused Meta ad" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("zernio_not_configured");

    await expect(
      createUseZernioTool(
        session({
          zernio: { enabled: true },
        }),
      ).execute!(
        { objective: "Create a paused Meta ad" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("zernio_not_configured");

    expect(mocks.loadZernioConnectionWithApiKey).not.toHaveBeenCalled();
    expect(mocks.createZernioAdsToolSet).not.toHaveBeenCalled();
  });

  it("rejects missing Zernio connections before opening ads tools", async () => {
    mocks.loadZernioConnectionWithApiKey.mockResolvedValue(
      err({ code: "zernio_connection_not_found" }),
    );

    await expect(
      createUseZernioTool(
        session({
          zernio: {
            enabled: true,
            connectionId: "11111111-1111-4111-8111-111111111111",
          },
        }),
      ).execute!(
        { objective: "Create a paused Meta ad" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("zernio_connection_not_found");

    expect(mocks.createZernioAdsToolSet).not.toHaveBeenCalled();
  });

  it("rejects disabled or unvalidated Zernio connections before opening ads tools", async () => {
    mocks.loadZernioConnectionWithApiKey.mockResolvedValue(
      ok({
        connection: {
          id: "11111111-1111-4111-8111-111111111111",
          enabled: false,
          validationStatus: "valid",
        },
        apiKey: "zernio_test_key",
      }),
    );

    await expect(
      createUseZernioTool(
        session({
          zernio: {
            enabled: true,
            connectionId: "11111111-1111-4111-8111-111111111111",
          },
        }),
      ).execute!(
        { objective: "Create a paused Meta ad" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("zernio_not_connected");

    mocks.loadZernioConnectionWithApiKey.mockResolvedValue(
      ok({
        connection: {
          id: "11111111-1111-4111-8111-111111111111",
          enabled: true,
          validationStatus: "unvalidated",
        },
        apiKey: "zernio_test_key",
      }),
    );

    await expect(
      createUseZernioTool(
        session({
          zernio: {
            enabled: true,
            connectionId: "11111111-1111-4111-8111-111111111111",
          },
        }),
      ).execute!(
        { objective: "Create a paused Meta ad" },
        { toolCallId: "call-1", messages: [], context: {} },
      ),
    ).rejects.toThrow("zernio_not_connected");

    expect(mocks.createZernioAdsToolSet).not.toHaveBeenCalled();
  });
});
