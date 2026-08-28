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

const getKnowledgeMemoryForOrganizationMock = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/hyperlocalise_test";
  process.env.PROVIDER_CREDENTIALS_MASTER_KEY ??= "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
  return vi.fn();
});
const getKnowledgeMemoryForProjectMock = vi.hoisted(() => vi.fn());
const selectKnowledgeMemoryContextMock = vi.hoisted(() => vi.fn());
const resolveWorkspaceKnowledgeFlagMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/knowledge-memory/knowledge-memory", () => ({
  getKnowledgeMemoryForOrganization: getKnowledgeMemoryForOrganizationMock,
  getKnowledgeMemoryForProject: getKnowledgeMemoryForProjectMock,
}));

vi.mock("@/lib/knowledge-memory/knowledge-memory-selection", () => ({
  selectKnowledgeMemoryContext: selectKnowledgeMemoryContextMock,
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
    model: "openai/gpt-5.6-luna",
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
    getKnowledgeMemoryForOrganizationMock.mockReset();
    getKnowledgeMemoryForProjectMock.mockReset();
    selectKnowledgeMemoryContextMock.mockReset();
    resolveWorkspaceKnowledgeFlagMock.mockReset();
    resolveWorkspaceKnowledgeFlagMock.mockResolvedValue(true);
  });

  it("is unavailable when knowledge is not enabled", async () => {
    const tool = createRecallMemoryTool(session({}));
    await expect(tool.execute!({ query: "who reviews PRs?" }, toolCallContext)).rejects.toThrow(
      "memory_not_enabled",
    );
    expect(getKnowledgeMemoryForOrganizationMock).not.toHaveBeenCalled();
  });

  it("records found: false, not a throw, when the workspace-knowledge feature flag is off", async () => {
    // Regression for two Codex findings: (1) automation create/update doesn't validate toolConfig
    // against the workspace-knowledge feature flag, so a flag disabled after an automation's
    // Memory tools were configured (or a config written some other way) would otherwise let a
    // scheduled or manual run keep reading Memory.md regardless of the flag — the same gate the
    // HTTP knowledge-memory route already enforces on every request; (2) recall_memory is the
    // first forced tool whenever Memory is planned at all, so throwing here (rather than a
    // nonfatal "not found", the same treatment as an empty Memory.md gets) risked the rest of the
    // planned run — including notifications — never getting a chance to run.
    resolveWorkspaceKnowledgeFlagMock.mockResolvedValue(false);

    const testSession = session({ knowledge: { enabled: true, allowUpdates: false } });
    const tool = createRecallMemoryTool(testSession);
    const result = await tool.execute!({ query: "who reviews PRs?" }, toolCallContext);

    expect(result).toEqual({ found: false, content: null });
    expect(testSession.stepResults.recall_memory).toEqual({ found: false });
    expect(resolveWorkspaceKnowledgeFlagMock).toHaveBeenCalledWith({ organizationId: "org-1" });
    expect(getKnowledgeMemoryForOrganizationMock).not.toHaveBeenCalled();
  });

  it("is scoped to the session's organization, never a client-suppliable value", async () => {
    getKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      revisionId: "rev-1",
      version: 1,
      content: "Reviewer for repo R is Y.",
      summary: "s",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedByUserId: "user-1",
    });
    selectKnowledgeMemoryContextMock.mockReturnValue({
      compactText: "Reviewer for repo R is Y.",
      segments: [],
      metrics: {
        selectedMemoryCount: 1,
        selectedMemoryChars: 25,
        wholeMemoryChars: 25,
        reductionPercent: 0,
        matchedHeadingPaths: [],
        fallbackMode: "selective",
      },
    });

    const tool = createRecallMemoryTool(
      session({ knowledge: { enabled: true, allowUpdates: false } }),
    );
    await tool.execute!({ query: "who reviews PRs?" }, toolCallContext);

    expect(getKnowledgeMemoryForOrganizationMock).toHaveBeenCalledWith("org-1");
    expect(selectKnowledgeMemoryContextMock).toHaveBeenCalledWith({
      content: "Reviewer for repo R is Y.",
      sourceText: "who reviews PRs?",
      context: "Nightly sync",
    });
  });

  it("returns found: false without throwing when Memory is empty", async () => {
    getKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      revisionId: null,
      version: 0,
      content: "",
      summary: null,
      updatedAt: null,
      updatedByUserId: null,
    });

    const tool = createRecallMemoryTool(
      session({ knowledge: { enabled: true, allowUpdates: false } }),
    );
    const result = await tool.execute!({ query: "anything" }, toolCallContext);

    expect(result).toEqual({ found: false, content: null });
    expect(selectKnowledgeMemoryContextMock).not.toHaveBeenCalled();
  });

  it("returns found: false when nothing relevant matches the query", async () => {
    getKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      revisionId: "rev-1",
      version: 1,
      content: "Some unrelated content.",
      summary: "s",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedByUserId: "user-1",
    });
    selectKnowledgeMemoryContextMock.mockReturnValue({
      compactText: "",
      segments: [],
      metrics: {
        selectedMemoryCount: 0,
        selectedMemoryChars: 0,
        wholeMemoryChars: 24,
        reductionPercent: 100,
        matchedHeadingPaths: [],
        fallbackMode: "none",
      },
    });

    const tool = createRecallMemoryTool(
      session({ knowledge: { enabled: true, allowUpdates: false } }),
    );
    const result = await tool.execute!({ query: "irrelevant question" }, toolCallContext);

    expect(result).toEqual({ found: false, content: null });
  });

  it("records only whether something was found in stepResults, never the recalled text", async () => {
    getKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      revisionId: "rev-1",
      version: 1,
      content: "A confidential-sounding internal rule.",
      summary: "s",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedByUserId: "user-1",
    });
    selectKnowledgeMemoryContextMock.mockReturnValue({
      compactText: "A confidential-sounding internal rule.",
      segments: [],
      metrics: {
        selectedMemoryCount: 1,
        selectedMemoryChars: 39,
        wholeMemoryChars: 39,
        reductionPercent: 0,
        matchedHeadingPaths: [],
        fallbackMode: "selective",
      },
    });

    const testSession = session({ knowledge: { enabled: true, allowUpdates: false } });
    const tool = createRecallMemoryTool(testSession);
    const result = await tool.execute!({ query: "internal rule" }, toolCallContext);

    expect(result).toEqual({ found: true, content: "A confidential-sounding internal rule." });
    expect(testSession.stepResults.recall_memory).toEqual({ found: true });
    expect(JSON.stringify(testSession.stepResults.recall_memory)).not.toContain("confidential");
  });

  it("combines project and workspace guidance when the automation has a project", async () => {
    getKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      revisionId: "rev-org",
      version: 1,
      content: "Workspace voice is calm.",
      summary: "s",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedByUserId: "user-1",
    });
    getKnowledgeMemoryForProjectMock.mockResolvedValue({
      revisionId: "rev-project",
      version: 1,
      content: "Checkout buttons stay short.",
      summary: "s",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedByUserId: "user-1",
    });
    selectKnowledgeMemoryContextMock.mockImplementation(({ content }: { content: string }) => ({
      compactText: content,
      segments: [],
      metrics: {
        selectedMemoryCount: 1,
        selectedMemoryChars: content.length,
        wholeMemoryChars: content.length,
        reductionPercent: 0,
        matchedHeadingPaths: [],
        fallbackMode: "selective",
      },
    }));

    const testSession = session({ knowledge: { enabled: true, allowUpdates: false } });
    testSession.automation.projectId = "project-1";
    const tool = createRecallMemoryTool(testSession);
    const result = await tool.execute!({ query: "checkout tone" }, toolCallContext);

    expect(getKnowledgeMemoryForProjectMock).toHaveBeenCalledWith("project-1");
    expect(result).toEqual({
      found: true,
      content: [
        "## Project guideline",
        "Checkout buttons stay short.",
        "## Workspace guideline",
        "Workspace voice is calm.",
      ].join("\n\n"),
    });
  });
});
