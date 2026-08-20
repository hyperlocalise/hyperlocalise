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
import { createCreateIssueTool } from "./create_issue";

const mocks = vi.hoisted(() => ({
  createIssue: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/projects/issue-sheet/issue-sheet-service", () => ({
  IssueSheetService: class {
    createIssue = mocks.createIssue;
  },
}));

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

function session(
  overrides: {
    outputSummary?: Record<string, unknown>;
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
    authorUserId?: string | null;
    projectId?: string | null;
  } = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: overrides.authorUserId === undefined ? "user-1" : overrides.authorUserId,
    status: "active",
    name: "File findings",
    instructions: "",
    projectId: overrides.projectId === undefined ? "project-1" : overrides.projectId,
    triggerConfig: { mode: "manual" },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? { createIssue: { enabled: true } },
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
    inputSnapshot: { projectId: "snapshot-project" },
    outputSummary: overrides.outputSummary ?? {},
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
    plan: { tools: ["create_issue"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

describe("createCreateIssueTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createIssue.mockResolvedValue({
      id: "issue-1",
      key: "ISS-1",
      title: "Missing glossary term",
      status: "open",
      issueType: "glossary_violation",
    });
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("creates issues with run-scoped external refs and no agent_runs FK", async () => {
    const currentSession = session();
    const tool = createCreateIssueTool(currentSession);

    const result = await tool.execute!(
      {
        issues: [
          {
            title: "Missing glossary term",
            issueType: "glossary_violation",
            priority: "P0",
          },
        ],
      },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    expect(mocks.createIssue).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "project-1",
      actorUserId: "user-1",
      body: expect.objectContaining({
        title: "Missing glossary term",
        issueType: "glossary_violation",
        priority: "P0",
        linkKind: "manual",
        linkLabel: "File findings",
        externalRef: "workspace-automation-run:run-1:0",
      }),
    });
    expect(mocks.createIssue.mock.calls[0]?.[0].body.linkedAgentRunId).toBeUndefined();
    expect(result).toMatchObject({
      projectId: "project-1",
      createdCount: 1,
      skipped: false,
      completed: true,
      issues: [{ id: "issue-1", key: "ISS-1", externalRef: "workspace-automation-run:run-1:0" }],
    });
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalled();
  });

  it("uses the automation project, not the input snapshot project", async () => {
    const tool = createCreateIssueTool(session());
    await tool.execute!(
      { issues: [{ title: "One" }] },
      { toolCallId: "call-1", messages: [], context: {} },
    );
    expect(mocks.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1" }),
    );
  });

  it("treats an empty issues array as a successful no-op", async () => {
    const currentSession = session();
    const tool = createCreateIssueTool(currentSession);

    const result = await tool.execute!(
      { issues: [] },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    expect(mocks.createIssue).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      createdCount: 0,
      skipped: true,
      completed: true,
      issues: [],
    });
  });

  it("returns completed create output for idempotent retries", async () => {
    const existing = {
      projectId: "project-1",
      createdCount: 1,
      skipped: false,
      completed: true,
      issues: [
        {
          id: "issue-existing",
          key: "ISS-9",
          title: "Existing",
          status: "open",
          issueType: "qa_failure",
          externalRef: "workspace-automation-run:run-1:0",
        },
      ],
    };
    const tool = createCreateIssueTool(session({ outputSummary: { createIssue: existing } }));

    const result = await tool.execute!(
      { issues: [{ title: "Should not create" }] },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    expect(result).toEqual(existing);
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });

  it("resumes from partial progress without recreating earlier issues", async () => {
    mocks.createIssue.mockResolvedValue({
      id: "issue-2",
      key: "ISS-2",
      title: "Second",
      status: "open",
      issueType: "qa_failure",
    });
    const partial = {
      projectId: "project-1",
      createdCount: 1,
      skipped: false,
      completed: false,
      issues: [
        {
          id: "issue-1",
          key: "ISS-1",
          title: "First",
          status: "open",
          issueType: "qa_failure",
          externalRef: "workspace-automation-run:run-1:0",
        },
      ],
    };
    const tool = createCreateIssueTool(session({ outputSummary: { createIssue: partial } }));

    const result = await tool.execute!(
      { issues: [{ title: "First" }, { title: "Second" }] },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    expect(mocks.createIssue).toHaveBeenCalledTimes(1);
    expect(mocks.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          title: "Second",
          externalRef: "workspace-automation-run:run-1:1",
        }),
      }),
    );
    expect(result).toMatchObject({
      createdCount: 2,
      completed: true,
      issues: [{ id: "issue-1" }, { id: "issue-2" }],
    });
  });
});
