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

import type { WorkspaceOrchestratorSession } from "../context";
import { createListIssuesTool } from "./list_issues";

const mocks = vi.hoisted(() => ({
  listIssues: vi.fn(),
}));

vi.mock("@/lib/projects/issue-sheet/issue-sheet-service", () => ({
  IssueSheetService: class {
    listIssues = mocks.listIssues;
  },
}));

function session(
  overrides: {
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
    name: "Issue triage",
    instructions: "",
    projectId: overrides.projectId === undefined ? "project-1" : overrides.projectId,
    triggerConfig: { mode: "manual" },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? { listIssues: { enabled: true } },
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
    plan: { tools: ["list_issues"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

describe("createListIssuesTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listIssues.mockResolvedValue({
      total: 1,
      summary: { total: 1, open: 1, inProgress: 0, resolved: 0, wontFix: 0 },
      columns: [],
      issues: [
        {
          id: "issue-1",
          key: "ISS-1",
          title: "Broken placeholder",
          description: "Missing {name}",
          issueType: "translation_mistake",
          status: "open",
          targetLocale: "fr-FR",
          assigneeUserId: null,
          sourcePath: "app.json",
          translationKeyId: null,
          updatedAt: "2026-08-13T00:00:00.000Z",
          values: { priority: "P1" },
        },
      ],
    });
  });

  it("lists compact issues for the automation project", async () => {
    const currentSession = session();
    const tool = createListIssuesTool(currentSession);

    const result = await tool.execute!(
      { status: "open", limit: 10 },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    expect(mocks.listIssues).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "project-1",
      actorUserId: "user-1",
      query: {
        status: "open",
        issueType: undefined,
        priority: undefined,
        search: undefined,
        sort: "status",
        limit: 10,
        offset: 0,
      },
    });
    expect(result).toMatchObject({
      projectId: "project-1",
      total: 1,
      issues: [
        {
          id: "issue-1",
          key: "ISS-1",
          title: "Broken placeholder",
          priority: "P1",
        },
      ],
    });
    expect(currentSession.stepResults.list_issues).toMatchObject({ total: 1 });
  });

  it("ignores snapshot projectId overrides", async () => {
    const tool = createListIssuesTool(session());
    await tool.execute!({}, { toolCallId: "call-1", messages: [], context: {} });
    expect(mocks.listIssues).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1" }),
    );
  });

  it("rejects when the list tool is not enabled", async () => {
    const tool = createListIssuesTool(session({ toolConfig: {} }));
    await expect(
      tool.execute!({}, { toolCallId: "call-1", messages: [], context: {} }),
    ).rejects.toThrow("list_issues_not_configured");
  });

  it("rejects when the automation has no author", async () => {
    const tool = createListIssuesTool(session({ authorUserId: null }));
    await expect(
      tool.execute!({}, { toolCallId: "call-1", messages: [], context: {} }),
    ).rejects.toThrow("automation_author_required");
  });
});
