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
const commitKnowledgeMemoryForOrganizationMock = vi.hoisted(() => vi.fn());
const resolveWorkspaceKnowledgeFlagMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/knowledge-memory/knowledge-memory", () => ({
  getKnowledgeMemoryForOrganization: getKnowledgeMemoryForOrganizationMock,
  commitKnowledgeMemoryForOrganization: commitKnowledgeMemoryForOrganizationMock,
}));

vi.mock("@/lib/flags/workspace-flags", () => ({
  resolveWorkspaceKnowledgeFlag: resolveWorkspaceKnowledgeFlagMock,
}));

import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automation-types";
import {
  KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH,
  KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH,
} from "@/lib/knowledge-memory/knowledge-memory.shared";

import type { WorkspaceOrchestratorSession } from "../context";
import { buildSaveMemorySummary, createSaveMemoryTool } from "./save_memory";

function automation(
  toolConfig: WorkspaceAutomationRecord["toolConfig"],
): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: "Nightly sync",
    instructions: "Remember reviewer preferences when asked.",
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

describe("buildSaveMemorySummary", () => {
  const runId = "11111111-1111-4111-8111-111111111111";

  it("keeps a short name intact", () => {
    const summary = buildSaveMemorySummary("Nightly sync", runId);
    expect(summary).toBe(`Auto-appended by automation "Nightly sync" (run ${runId})`);
    expect(summary.length).toBeLessThanOrEqual(KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH);
  });

  it("truncates a name that would push the summary past the DB limit", () => {
    const longName = "A".repeat(120);
    const summary = buildSaveMemorySummary(longName, runId);
    expect(summary.length).toBeLessThanOrEqual(KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH);
    expect(summary).toContain("…");
    expect(summary).toContain(runId);
  });
});

describe("createSaveMemoryTool", () => {
  beforeEach(() => {
    getKnowledgeMemoryForOrganizationMock.mockReset();
    commitKnowledgeMemoryForOrganizationMock.mockReset();
    resolveWorkspaceKnowledgeFlagMock.mockReset();
    resolveWorkspaceKnowledgeFlagMock.mockResolvedValue(true);
  });

  it("records a skipped outcome, not a throw, when the workspace-knowledge feature flag is off", async () => {
    // Regression for two Codex findings: (1) automation create/update doesn't validate toolConfig
    // against the workspace-knowledge feature flag, so a flag disabled after an automation's
    // Memory tools were configured (or a config written some other way) would otherwise let a
    // scheduled or manual run keep mutating Memory.md regardless of the flag — the same gate the
    // HTTP knowledge-memory route already enforces on every request; (2) this is the first forced
    // tool whenever save_memory is planned, so throwing here (rather than recording a nonfatal
    // outcome, the same way stale-revision and size-limit already do) risked the rest of the
    // planned run — including notifications — never getting a chance to reflect what happened.
    resolveWorkspaceKnowledgeFlagMock.mockResolvedValue(false);

    const testSession = session({ knowledge: { enabled: true, allowUpdates: true } });
    const tool = createSaveMemoryTool(testSession);
    const result = await tool.execute!(
      { entry: "Remember X." },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    expect(result).toEqual({ appended: false, reason: "feature_disabled" });
    expect(testSession.stepResults.save_memory).toEqual({
      appended: false,
      reason: "feature_disabled",
    });
    expect(resolveWorkspaceKnowledgeFlagMock).toHaveBeenCalledWith({ organizationId: "org-1" });
    expect(getKnowledgeMemoryForOrganizationMock).not.toHaveBeenCalled();
  });

  it("is unavailable when knowledge is not enabled at all", async () => {
    const tool = createSaveMemoryTool(session({}));
    await expect(
      tool.execute!({ entry: "Remember X." }, { toolCallId: "call-1", messages: [], context: {} }),
    ).rejects.toThrow("memory_updates_not_allowed");
    expect(getKnowledgeMemoryForOrganizationMock).not.toHaveBeenCalled();
  });

  it("is unavailable when enabled but allowUpdates is false", async () => {
    const tool = createSaveMemoryTool(
      session({ knowledge: { enabled: true, allowUpdates: false } }),
    );
    await expect(
      tool.execute!({ entry: "Remember X." }, { toolCallId: "call-1", messages: [], context: {} }),
    ).rejects.toThrow("memory_updates_not_allowed");
    expect(getKnowledgeMemoryForOrganizationMock).not.toHaveBeenCalled();
  });

  it("appends to existing content without altering it, scoped to the session's organization", async () => {
    getKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      revisionId: "rev-1",
      version: 1,
      content: "Existing rule one.",
      summary: "Initial version",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedByUserId: "user-1",
    });
    commitKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      ok: true,
      value: {
        knowledgeMemory: { revisionId: "rev-2", version: 2, content: "irrelevant", summary: "s" },
        changed: true,
      },
    });

    const tool = createSaveMemoryTool(
      session({ knowledge: { enabled: true, allowUpdates: true } }),
    );
    const result = await tool.execute!(
      { entry: "Reviewer for repo R is Y." },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    expect(getKnowledgeMemoryForOrganizationMock).toHaveBeenCalledWith("org-1");
    expect(commitKnowledgeMemoryForOrganizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        content: "Existing rule one.\n\nReviewer for repo R is Y.",
        expectedRevisionId: "rev-1",
        updatedByUserId: null,
      }),
    );
    expect(result).toEqual({ appended: true, revisionId: "rev-2" });
  });

  it("records provenance (automation name and run id) in the commit summary, not the content", async () => {
    getKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      revisionId: null,
      version: 0,
      content: "",
      summary: null,
      updatedAt: null,
      updatedByUserId: null,
    });
    commitKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      ok: true,
      value: {
        knowledgeMemory: { revisionId: "rev-1", version: 1, content: "irrelevant", summary: "s" },
        changed: true,
      },
    });

    const tool = createSaveMemoryTool(
      session({ knowledge: { enabled: true, allowUpdates: true } }),
    );
    await tool.execute!(
      { entry: "First fact." },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    const commitCall = commitKnowledgeMemoryForOrganizationMock.mock.calls[0]![0];
    expect(commitCall.summary).toContain("Nightly sync");
    expect(commitCall.summary).toContain("run-1");
    expect(commitCall.content).not.toContain("Nightly sync");
  });

  it("records a size-limit outcome without committing, instead of throwing", async () => {
    // Regression for a Codex finding: same reasoning as the stale-revision case below — Memory.md
    // nearing its cap is an expected domain limit, not a bug, and the forced notification step
    // right after this one should be able to report the skipped update instead of getting no
    // signal because this threw.
    getKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      revisionId: "rev-1",
      version: 1,
      content: "x".repeat(KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH - 5),
      summary: "Initial version",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedByUserId: "user-1",
    });

    const testSession = session({ knowledge: { enabled: true, allowUpdates: true } });
    const tool = createSaveMemoryTool(testSession);
    const result = await tool.execute!(
      { entry: "This entry pushes the document past the limit." },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    expect(result).toEqual({ appended: false, reason: "size_limit_exceeded" });
    expect(testSession.stepResults.save_memory).toEqual({
      appended: false,
      reason: "size_limit_exceeded",
    });
    expect(commitKnowledgeMemoryForOrganizationMock).not.toHaveBeenCalled();
  });

  it("records a stale revision as a skipped outcome instead of throwing", async () => {
    // Regression for a Codex finding: save_memory is a forced tool now (see createSaveMemoryTool's
    // docstring), so its next step (often a notification) is forced regardless of what happens
    // here — but the model can only tell the run's outcome apart from a plain crash if this
    // returns a result the model can see, instead of throwing and leaving the notification step
    // with no signal that the update was skipped.
    getKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      revisionId: "rev-1",
      version: 1,
      content: "Existing rule.",
      summary: "Initial version",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedByUserId: "user-1",
    });
    commitKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      ok: false,
      error: { code: "precondition_failed", current: { revisionId: "rev-2" } },
    });

    const testSession = session({ knowledge: { enabled: true, allowUpdates: true } });
    const tool = createSaveMemoryTool(testSession);
    const result = await tool.execute!(
      { entry: "Another fact." },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    expect(result).toEqual({ appended: false, reason: "stale_revision" });
    expect(testSession.stepResults.save_memory).toEqual({
      appended: false,
      reason: "stale_revision",
    });
  });

  it("treats a null entry as an explicit decision not to remember anything", async () => {
    // save_memory is forced every run (see createSaveMemoryTool's docstring), so the model needs
    // a way to comply without inventing content: entry: null short-circuits before touching
    // Memory.md at all.
    const testSession = session({ knowledge: { enabled: true, allowUpdates: true } });
    const tool = createSaveMemoryTool(testSession);
    const result = await tool.execute!(
      { entry: null },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    expect(result).toEqual({ appended: false });
    expect(testSession.stepResults.save_memory).toEqual({ appended: false });
    expect(getKnowledgeMemoryForOrganizationMock).not.toHaveBeenCalled();
    expect(commitKnowledgeMemoryForOrganizationMock).not.toHaveBeenCalled();
  });

  it("truncates a long automation name so the commit summary never exceeds the DB limit", async () => {
    // Regression for a Codex finding: an 88-120 char automation name (accepted by the API) made
    // the fixed prefix + name + run UUID exceed the 160-char
    // knowledge_memories_summary_length_check, so every save_memory call for that automation
    // failed at the database instead of appending the entry.
    getKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      revisionId: "rev-1",
      version: 1,
      content: "",
      summary: null,
      updatedAt: null,
      updatedByUserId: null,
    });
    commitKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      ok: true,
      value: {
        knowledgeMemory: { revisionId: "rev-2", version: 2, content: "irrelevant", summary: "s" },
        changed: true,
      },
    });

    const longName = "A".repeat(120);
    const testSession = session({ knowledge: { enabled: true, allowUpdates: true } });
    testSession.automation.name = longName;
    const tool = createSaveMemoryTool(testSession);
    await tool.execute!(
      { entry: "First fact." },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    const commitCall = commitKnowledgeMemoryForOrganizationMock.mock.calls[0]![0];
    expect(commitCall.summary.length).toBeLessThanOrEqual(KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH);
    expect(commitCall.summary).toContain("run-1");
  });

  it("never persists the appended text into stepResults", async () => {
    getKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      revisionId: "rev-1",
      version: 1,
      content: "Existing rule.",
      summary: "Initial version",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedByUserId: "user-1",
    });
    commitKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      ok: true,
      value: {
        knowledgeMemory: { revisionId: "rev-2", version: 2, content: "irrelevant", summary: "s" },
        changed: true,
      },
    });

    const testSession = session({ knowledge: { enabled: true, allowUpdates: true } });
    const tool = createSaveMemoryTool(testSession);
    await tool.execute!(
      { entry: "A secret-looking fact nobody should log." },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    expect(testSession.stepResults.save_memory).toEqual({ appended: true, revisionId: "rev-2" });
    expect(JSON.stringify(testSession.stepResults.save_memory)).not.toContain("secret-looking");
  });
});
