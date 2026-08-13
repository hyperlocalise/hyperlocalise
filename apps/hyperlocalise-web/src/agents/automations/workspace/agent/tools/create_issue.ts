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
} from "@/api/routes/project/issue-sheet.schema";
import { updateWorkspaceAutomationRun } from "@/lib/agents/workspace-automations";
import { resolveWorkspaceIssuesFlag } from "@/lib/flags/workspace-flags";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  mergeToolOutputSummaryIntoSessionRun,
  readCreateIssue,
} from "../workspace-orchestrator-output-summary";

const createIssueItemSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20_000).optional(),
  issueType: issueSheetIssueTypeSchema.optional(),
  status: issueSheetIssueStatusSchema.optional(),
  targetLocale: z.string().trim().min(1).max(32).optional(),
  sourcePath: z.string().trim().min(1).max(2048).optional(),
  translationKeyId: z.string().uuid().optional(),
  assigneeUserId: z.string().uuid().optional(),
  priority: z.enum(["P0", "P1", "P2"]).optional(),
});

const createIssueInputSchema = z.object({
  issues: z
    .array(createIssueItemSchema)
    .max(20)
    .describe(
      "Issues to create on the project Issue Sheet. Pass an empty array when nothing should be filed this run.",
    ),
});

type CreatedIssueSummary = {
  id: string;
  key: string | null;
  title: string;
  status: string;
  issueType: string;
  externalRef: string;
};

function buildCreateIssueExternalRef(runId: string, index: number): string {
  return `workspace-automation-run:${runId}:${index}`;
}

async function persistCreateIssueOutput(
  session: WorkspaceOrchestratorSession,
  output: Record<string, unknown>,
) {
  session.stepResults.create_issue = output;
  await updateWorkspaceAutomationRun({
    runId: session.run.id,
    organizationId: session.organizationId,
    outputSummary: {
      ...session.run.outputSummary,
      createIssue: output,
    },
  });
  mergeToolOutputSummaryIntoSessionRun(session, { createIssue: output });
}

export function createCreateIssueTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Create Hyperlocalise Issue Sheet issues for the automation project. Pass an empty issues array when there is nothing actionable to file.",
    inputSchema: createIssueInputSchema,
    execute: async ({ issues }) => {
      const createConfig = session.automation.toolConfig.createIssue;
      if (!createConfig?.enabled) {
        throw new Error("create_issue_not_configured");
      }

      const issuesFeatureEnabled = await resolveWorkspaceIssuesFlag({
        organizationId: session.organizationId,
      });
      if (!issuesFeatureEnabled) {
        throw new Error("issues_feature_unavailable");
      }

      const existingOutput = readCreateIssue(session.run.outputSummary, session.stepResults);
      if (existingOutput?.completed === true) {
        session.stepResults.create_issue = existingOutput;
        return existingOutput;
      }

      const projectId = session.automation.projectId?.trim() || null;
      if (!projectId) {
        throw new Error("project_required");
      }

      const actorUserId = session.automation.authorUserId?.trim() || null;
      if (!actorUserId) {
        throw new Error("automation_author_required");
      }

      const created: CreatedIssueSummary[] = Array.isArray(existingOutput?.issues)
        ? (existingOutput.issues as CreatedIssueSummary[]).filter(
            (issue) =>
              issue &&
              typeof issue === "object" &&
              typeof issue.id === "string" &&
              typeof issue.externalRef === "string",
          )
        : [];

      if (issues.length === 0) {
        const output = {
          projectId,
          createdCount: 0,
          skipped: true,
          completed: true,
          issues: [],
        };
        await persistCreateIssueOutput(session, output);
        return output;
      }

      const service = new IssueSheetService();
      const linkLabel = session.automation.name.slice(0, 200) || "Agent Automation";

      for (let index = created.length; index < issues.length; index += 1) {
        const issue = issues[index];
        if (!issue) {
          continue;
        }
        const externalRef = buildCreateIssueExternalRef(session.run.id, index);
        const record = await service.createIssue({
          organizationId: session.organizationId,
          projectId,
          actorUserId,
          body: {
            title: issue.title,
            description: issue.description,
            issueType: issue.issueType,
            status: issue.status,
            targetLocale: issue.targetLocale,
            sourcePath: issue.sourcePath,
            translationKeyId: issue.translationKeyId,
            assigneeUserId: issue.assigneeUserId,
            priority: issue.priority,
            // workspace_automation_runs are not agent_runs; use externalRef for idempotent linkage.
            linkKind: "manual",
            linkLabel,
            externalRef,
          },
        });
        created.push({
          id: record.id,
          key: record.key,
          title: record.title,
          status: record.status,
          issueType: record.issueType,
          externalRef,
        });

        const partialOutput = {
          projectId,
          createdCount: created.length,
          skipped: false,
          completed: created.length >= issues.length,
          issues: created,
        };
        await persistCreateIssueOutput(session, partialOutput);
      }

      const output = {
        projectId,
        createdCount: created.length,
        skipped: false,
        completed: true,
        issues: created,
      };
      await persistCreateIssueOutput(session, output);
      return output;
    },
  });
}
