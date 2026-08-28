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
import type { IssueBulkActionBody } from "@/api/routes/issues/issues-bulk.schema";
import { canAccessProject } from "@/api/auth/team-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { db } from "@/lib/database/client";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

import {
  IssueSheetService,
  type IssueSheetIssue,
  type IssueSheetUpdateIssueOutcome,
} from "./issue-sheet-service";

const BULK_UPDATE_CONCURRENCY = 4;

export type IssueBulkItemResult = {
  issueId: string;
  projectId: string;
  outcome: "updated" | "unchanged" | "failed";
  issue?: IssueSheetIssue;
  error?: {
    code: "issue_not_found" | "assignee_not_assignable" | "issue_update_failed";
    message?: string;
  };
};

export type IssueBulkActionResult = {
  action: IssueBulkActionBody["action"];
  requested: number;
  succeeded: number;
  failed: number;
  unchanged: number;
  results: IssueBulkItemResult[];
};

function dedupeBulkTargets(body: IssueBulkActionBody) {
  const seen = new Set<string>();
  const targets: IssueBulkActionBody["issues"] = [];
  for (const target of body.issues) {
    const key = `${target.projectId}:${target.issueId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    targets.push(target);
  }
  return targets;
}

function mapUpdateError(error: unknown): IssueBulkItemResult["error"] {
  if (error instanceof Error) {
    if (error.message === "assignee_not_assignable") {
      return { code: "assignee_not_assignable" };
    }
    if (error.message === "issue_sheet_issue_not_found") {
      return { code: "issue_not_found" };
    }
  }
  return { code: "issue_update_failed" };
}

function isUpdateOutcome(
  result: IssueSheetIssue | IssueSheetUpdateIssueOutcome | null,
): result is IssueSheetUpdateIssueOutcome {
  return result != null && "outcome" in result;
}

export class IssueBulkUpdateService {
  constructor(
    private readonly database = db,
    private readonly issueSheetService = new IssueSheetService(database),
  ) {}

  async run(auth: ApiAuthContext, body: IssueBulkActionBody): Promise<IssueBulkActionResult> {
    const organizationId = auth.organization.localOrganizationId;
    const actorUserId = auth.user.localUserId;
    const targets = dedupeBulkTargets(body);

    const results = await mapWithConcurrency(targets, BULK_UPDATE_CONCURRENCY, async (target) => {
      try {
        return await this.applyAction({
          auth,
          organizationId,
          actorUserId,
          body,
          target,
        });
      } catch (error) {
        return {
          issueId: target.issueId,
          projectId: target.projectId,
          outcome: "failed" as const,
          error: mapUpdateError(error),
        };
      }
    });

    let succeeded = 0;
    let failed = 0;
    let unchanged = 0;
    for (const result of results) {
      if (result.outcome === "updated") {
        succeeded += 1;
      } else if (result.outcome === "unchanged") {
        unchanged += 1;
      } else {
        failed += 1;
      }
    }

    return {
      action: body.action,
      requested: targets.length,
      succeeded,
      failed,
      unchanged,
      results,
    };
  }

  private async applyAction(input: {
    auth: ApiAuthContext;
    organizationId: string;
    actorUserId: string;
    body: IssueBulkActionBody;
    target: IssueBulkActionBody["issues"][number];
  }): Promise<IssueBulkItemResult> {
    const { target } = input;
    const accessibleProject = await canAccessProject(input.auth, target.projectId);
    if (!accessibleProject) {
      return {
        issueId: target.issueId,
        projectId: target.projectId,
        outcome: "failed",
        error: { code: "issue_not_found" },
      };
    }

    const base = {
      organizationId: input.organizationId,
      projectId: target.projectId,
      issueId: target.issueId,
      actorUserId: input.actorUserId,
      returnOutcome: true as const,
    };

    switch (input.body.action) {
      case "assign": {
        const result = await this.issueSheetService.updateIssue({
          ...base,
          body: { assigneeUserId: input.body.assigneeUserId },
        });
        return this.mapUpdateResult(target, result);
      }
      case "unassign": {
        const result = await this.issueSheetService.updateIssue({
          ...base,
          body: { assigneeUserId: null },
        });
        return this.mapUpdateResult(target, result);
      }
      case "set_status": {
        const result = await this.issueSheetService.updateIssue({
          ...base,
          body: { status: input.body.status },
        });
        return this.mapUpdateResult(target, result);
      }
      case "set_issue_type": {
        const result = await this.issueSheetService.updateIssue({
          ...base,
          body: { issueType: input.body.issueType },
        });
        return this.mapUpdateResult(target, result);
      }
      case "set_priority": {
        const priorityResult = await this.issueSheetService.setPriority({
          organizationId: input.organizationId,
          projectId: target.projectId,
          issueId: target.issueId,
          actorUserId: input.actorUserId,
          priority: input.body.priority,
        });
        if (priorityResult == null) {
          return {
            issueId: target.issueId,
            projectId: target.projectId,
            outcome: "failed",
            error: { code: "issue_not_found" },
          };
        }
        if (priorityResult.outcome === "unchanged") {
          const issue = await this.issueSheetService.getIssueForActor(base);
          return {
            issueId: target.issueId,
            projectId: target.projectId,
            outcome: "unchanged",
            ...(issue ? { issue } : {}),
          };
        }
        const issue = await this.issueSheetService.getIssueForActor(base);
        if (!issue) {
          return {
            issueId: target.issueId,
            projectId: target.projectId,
            outcome: "failed",
            error: { code: "issue_not_found" },
          };
        }
        return { issueId: target.issueId, projectId: target.projectId, outcome: "updated", issue };
      }
      default:
        return {
          issueId: target.issueId,
          projectId: target.projectId,
          outcome: "failed",
          error: { code: "issue_update_failed" },
        };
    }
  }

  private mapUpdateResult(
    target: IssueBulkActionBody["issues"][number],
    result: IssueSheetIssue | IssueSheetUpdateIssueOutcome | null,
  ): IssueBulkItemResult {
    if (!isUpdateOutcome(result)) {
      return {
        issueId: target.issueId,
        projectId: target.projectId,
        outcome: "failed",
        error: { code: "issue_not_found" },
      };
    }

    return {
      issueId: target.issueId,
      projectId: target.projectId,
      outcome: result.outcome,
      issue: result.issue,
    };
  }
}

export const issueBulkUpdateService = new IssueBulkUpdateService();
