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
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { upsertWorkspaceAutomationPullRequestComment } from "@/lib/agents/github/upsert-workspace-automation-pull-request-comment";
import { db, schema } from "@/lib/database/client";

import type { WorkspaceOrchestratorSession } from "../context";
import { buildOrchestratorRunSummaryMessage } from "../summary-message";

function readSnapshotString(snapshot: Record<string, unknown>, key: string): string | null {
  const value = snapshot[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function createNotifyGithubCommentTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Post or update a sticky GitHub pull request comment summarizing this automation run. Pass `message` as GitHub-flavored Markdown. Follow any customer-specified comment format first; otherwise use a bold headline, short bullets, and a next step. If no pull request is associated with the push, the tool skips without failing the run.",
    inputSchema: z.object({
      message: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          "Markdown summary for the pull request comment. Prefer the customer's requested format when provided; otherwise a bold headline, short bullets for key facts, and a one-line next step.",
        ),
    }),
    execute: async ({ message }) => {
      const githubComment = session.automation.toolConfig.githubComment;
      if (!githubComment?.enabled) {
        throw new Error("github_comment_not_configured");
      }

      if (!session.repository) {
        throw new Error("github_repository_target_required");
      }

      const [repositoryRow] = await db
        .select({
          fullName: schema.githubInstallationRepositories.fullName,
          githubInstallationId: schema.githubInstallationRepositories.githubInstallationId,
        })
        .from(schema.githubInstallationRepositories)
        .where(
          and(
            eq(schema.githubInstallationRepositories.id, session.repository.id),
            eq(schema.githubInstallationRepositories.organizationId, session.organizationId),
          ),
        )
        .limit(1);

      if (!repositoryRow) {
        throw new Error("github_repository_not_found");
      }

      const commitSha = readSnapshotString(session.run.inputSnapshot, "commitAfter");
      const pullRequestNumberRaw = session.run.inputSnapshot.pullRequestNumber;
      const pullRequestNumber =
        typeof pullRequestNumberRaw === "number" &&
        Number.isInteger(pullRequestNumberRaw) &&
        pullRequestNumberRaw > 0
          ? pullRequestNumberRaw
          : undefined;
      const text = message?.trim() || buildOrchestratorRunSummaryMessage(session);
      const result = await upsertWorkspaceAutomationPullRequestComment({
        installationId: repositoryRow.githubInstallationId,
        repositoryFullName: repositoryRow.fullName,
        automationId: session.automation.id,
        commitSha: commitSha ?? "",
        pullRequestNumber,
        message: text,
      });

      const payload = result.ok
        ? result.value.status === "skipped"
          ? {
              posted: false,
              skipped: true,
              code: result.value.code,
            }
          : {
              posted: true,
              skipped: false,
              action: result.value.status,
              pullRequestNumber: result.value.pullRequestNumber,
              commentId: result.value.commentId,
              url: result.value.url,
            }
        : {
            posted: false,
            skipped: false,
            code: result.error.code,
            message: result.error.message,
          };

      session.stepResults.notify_github_comment = payload;
      return payload;
    },
  });
}
