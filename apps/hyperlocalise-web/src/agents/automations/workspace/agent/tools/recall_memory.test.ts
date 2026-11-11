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

const loadUploadedGuidelinesContextMock = vi.hoisted(() => vi.fn());
const resolveWorkspaceKnowledgeFlagMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/knowledge-memory/uploaded-guidelines-context", () => ({
  loadUploadedGuidelinesContext: loadUploadedGuidelinesContextMock,
}));

vi.mock("@/lib/flags/workspace-flags", () => ({
  resolveWorkspaceKnowledgeFlag: resolveWorkspaceKnowledgeFlagMock,
}));

import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automation-types";

import type { WorkspaceOrchestratorSession } from "../context";
import { createRecallMemoryTool } from "./recall_memory";

function automation(
  toolConfig: WorkspaceAutomationRecord["toolConfig"],
): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: "Nightly sync",
    instructions: "Keep product names consistent.",
    projectId: null,
    triggerConfig: { mode: "manual" },
    repositoryTarget: { kind: "none" },
    toolConfig,
    model: "openai/gpt-6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function run(): WorkspaceAutomationRunRecord {
  return {
    id: "run-1",
    automationId: "automation-1",
    organizationId: "org-1",
    triggerSource: "manual",
    status: "running",
    idempotencyKey: null,
    inputSnapshot: {},
    outputSummary: {},
    error: null,
    githubRepositoryAutomationJobId: null,
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function session(
  toolConfig: WorkspaceAutomationRecord["toolConfig"],
): WorkspaceOrchestratorSession {
  return {
    organizationId: "org-1",
    automation: automation(toolConfig),
    run: run(),
    plan: { tools: [] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolCallContext = { toolCallId: "call-1", messages: [], context: {} };

describe("createRecallMemoryTool", () => {
  beforeEach(() => {
    loadUploadedGuidelinesContextMock.mockReset();
    loadUploadedGuidelinesContextMock.mockResolvedValue({ text: "", documents: [] });
    resolveWorkspaceKnowledgeFlagMock.mockReset();
    resolveWorkspaceKnowledgeFlagMock.mockResolvedValue(true);
  });

  it("is unavailable when knowledge is not enabled", async () => {
    const tool = createRecallMemoryTool(session({}));
    await expect(tool.execute!({ query: "who reviews PRs?" }, toolCallContext)).rejects.toThrow(
      "memory_not_enabled",
    );
    expect(loadUploadedGuidelinesContextMock).not.toHaveBeenCalled();
  });

  it("records found: false, not a throw, when the workspace-knowledge feature flag is off", async () => {
    // Regression for two Codex findings: (1) automation create/update doesn't validate toolConfig
    // against the workspace-knowledge feature flag, so a flag disabled after an automation's
    // guideline tools were configured (or a config written some other way) would otherwise let a
    // scheduled or manual run keep reading guideline documents regardless of the flag; (2)
    // recall_memory is the first forced tool whenever guideline lookup is planned at all, so
    // throwing here (rather than a nonfatal "not found", the same treatment as no matching
    // document gets) risked the rest of the planned run — including notifications — never
    // getting a chance to run.
    resolveWorkspaceKnowledgeFlagMock.mockResolvedValue(false);

    const testSession = session({ knowledge: { enabled: true } });
    const tool = createRecallMemoryTool(testSession);
    const result = await tool.execute!({ query: "who reviews PRs?" }, toolCallContext);

    expect(result).toEqual({ found: false, content: null });
    expect(testSession.stepResults.recall_memory).toEqual({ found: false });
    expect(resolveWorkspaceKnowledgeFlagMock).toHaveBeenCalledWith({ organizationId: "org-1" });
    expect(loadUploadedGuidelinesContextMock).not.toHaveBeenCalled();
  });

  it("retrieves locale-independent guideline documents for the session organization", async () => {
    loadUploadedGuidelinesContextMock.mockResolvedValue({
      text: "Reviewer for repo R is Y.",
      documents: [],
    });

    const tool = createRecallMemoryTool(session({ knowledge: { enabled: true } }));
    const result = await tool.execute!({ query: "who reviews PRs?" }, toolCallContext);

    expect(result).toEqual({ found: true, content: "Reviewer for repo R is Y." });
    expect(loadUploadedGuidelinesContextMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: undefined,
      targetLocales: [],
      sourceText: "who reviews PRs?",
    });
  });

  it("scopes retrieval to the automation project when one is set", async () => {
    const testSession = session({ knowledge: { enabled: true } });
    testSession.automation.projectId = "project-1";
    const tool = createRecallMemoryTool(testSession);
    await tool.execute!({ query: "checkout tone" }, toolCallContext);

    expect(loadUploadedGuidelinesContextMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "project-1",
      targetLocales: [],
      sourceText: "checkout tone",
    });
  });

  it("returns found: false without throwing when no document matches", async () => {
    const tool = createRecallMemoryTool(session({ knowledge: { enabled: true } }));
    const result = await tool.execute!({ query: "anything" }, toolCallContext);

    expect(result).toEqual({ found: false, content: null });
  });

  it("records only whether something was found in stepResults, never the recalled text", async () => {
    loadUploadedGuidelinesContextMock.mockResolvedValue({
      text: "A confidential-sounding internal rule.",
      documents: [],
    });

    const testSession = session({ knowledge: { enabled: true } });
    const tool = createRecallMemoryTool(testSession);
    const result = await tool.execute!({ query: "internal rule" }, toolCallContext);

    expect(result).toEqual({ found: true, content: "A confidential-sounding internal rule." });
    expect(testSession.stepResults.recall_memory).toEqual({ found: true });
    expect(JSON.stringify(testSession.stepResults.recall_memory)).not.toContain("confidential");
  });
});
