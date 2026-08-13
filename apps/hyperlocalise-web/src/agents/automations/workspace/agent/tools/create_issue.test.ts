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
  } = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: overrides.authorUserId === undefined ? "user-1" : overrides.authorUserId,
    status: "active",
    name: "File findings",
    instructions: "",
    projectId: "project-1",
    triggerConfig: { mode: "manual" },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? { createIssue: { enabled: true } },
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

  it("creates issues and links them to the automation run", async () => {
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
        linkedAgentRunId: "run-1",
        linkKind: "agent_run",
        linkLabel: "File findings",
      }),
    });
    expect(result).toMatchObject({
      projectId: "project-1",
      createdCount: 1,
      skipped: false,
      issues: [{ id: "issue-1", key: "ISS-1" }],
    });
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalled();
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
      issues: [],
    });
  });

  it("returns existing create output for idempotent retries", async () => {
    const existing = {
      projectId: "project-1",
      createdCount: 1,
      skipped: false,
      issues: [
        {
          id: "issue-existing",
          key: "ISS-9",
          title: "Existing",
          status: "open",
          issueType: "qa_failure",
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
});
