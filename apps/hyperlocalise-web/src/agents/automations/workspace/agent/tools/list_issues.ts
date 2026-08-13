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
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import {
  issueSheetIssueStatusSchema,
  issueSheetIssueTypeSchema,
  issueSheetPrioritySchema,
} from "@/api/routes/project/issue-sheet.schema";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";

import type { WorkspaceOrchestratorSession } from "../context";

const listIssuesInputSchema = z.object({
  status: issueSheetIssueStatusSchema.or(z.literal("all")).optional(),
  issueType: issueSheetIssueTypeSchema.or(z.literal("all")).optional(),
  priority: issueSheetPrioritySchema.optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

function resolveProjectId(session: WorkspaceOrchestratorSession): string | null {
  const fromSnapshot =
    typeof session.run.inputSnapshot.projectId === "string"
      ? session.run.inputSnapshot.projectId.trim()
      : "";
  const fromAutomation = session.automation.projectId?.trim() || "";
  return fromSnapshot || fromAutomation || null;
}

function compactIssue(issue: {
  id: string;
  key: string | null;
  title: string;
  description: string;
  issueType: string;
  status: string;
  targetLocale: string | null;
  assigneeUserId: string | null;
  sourcePath: string | null;
  translationKeyId: string | null;
  updatedAt: string;
  values: Record<string, unknown>;
}) {
  const priority = issue.values.priority;
  return {
    id: issue.id,
    key: issue.key,
    title: issue.title,
    description: issue.description.slice(0, 500),
    issueType: issue.issueType,
    status: issue.status,
    targetLocale: issue.targetLocale,
    assigneeUserId: issue.assigneeUserId,
    sourcePath: issue.sourcePath,
    translationKeyId: issue.translationKeyId,
    priority: typeof priority === "string" ? priority : null,
    updatedAt: issue.updatedAt,
  };
}

export function createListIssuesTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "List Hyperlocalise Issue Sheet issues for the automation project. Use filters to triage open work before creating or notifying.",
    inputSchema: listIssuesInputSchema,
    execute: async (input) => {
      const listConfig = session.automation.toolConfig.listIssues;
      if (!listConfig?.enabled) {
        throw new Error("list_issues_not_configured");
      }

      const projectId = resolveProjectId(session);
      if (!projectId) {
        throw new Error("project_required");
      }

      const actorUserId = session.automation.authorUserId?.trim() || null;
      if (!actorUserId) {
        throw new Error("automation_author_required");
      }

      const service = new IssueSheetService();
      const result = await service.listIssues({
        organizationId: session.organizationId,
        projectId,
        actorUserId,
        query: {
          status: input.status,
          issueType: input.issueType,
          priority: input.priority,
          search: input.search,
          sort: "status",
          limit: input.limit ?? 50,
          offset: input.offset ?? 0,
        },
      });

      const output = {
        projectId,
        total: result.total,
        summary: result.summary,
        issues: result.issues.map(compactIssue),
      };

      session.stepResults.list_issues = output;
      return output;
    },
  });
}
