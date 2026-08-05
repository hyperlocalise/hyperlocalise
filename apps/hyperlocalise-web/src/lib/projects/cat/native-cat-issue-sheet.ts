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
import type { ProjectFileCatComment } from "@/api/routes/project/project.schema";
import type { IssueSheetCreateIssueBody } from "@/api/routes/project/issue-sheet.schema";
import { issueSheetIssueTypeSchema } from "@/api/routes/project/issue-sheet.schema";
import { createLogger } from "@/lib/log";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";

const log = createLogger("projects.cat.issue-sheet");

const ISSUE_TITLE_MAX = 300;

function resolveIssueType(issueType: string | undefined) {
  const parsed = issueSheetIssueTypeSchema.safeParse(issueType);
  return parsed.success ? parsed.data : "general_question";
}

function buildCatSegmentLinkUrl(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  segmentId: string;
}) {
  const params = new URLSearchParams({
    sourcePath: input.sourcePath,
    locale: input.targetLocale,
    segment: input.segmentId,
  });
  return `/org/${input.organizationSlug}/projects/${encodeURIComponent(input.projectId)}/files/cat?${params.toString()}`;
}

function buildIssueTitle(text: string) {
  const trimmed = text.trim();
  if (trimmed.length <= ISSUE_TITLE_MAX) {
    return trimmed || "CAT issue";
  }
  return `${trimmed.slice(0, ISSUE_TITLE_MAX - 1)}…`;
}

/**
 * After a native CAT "Raise issue" comment is saved, mirror it into Issues
 * (issue sheet) so collaborators can track it alongside string-linked issues.
 */
export async function maybeCreateIssueSheetFromNativeCatIssueComment(input: {
  organizationId: string;
  organizationSlug: string;
  projectId: string;
  actorUserId: string;
  sourcePath: string;
  targetLocale: string;
  translationKeyId: string;
  issueType?: string;
  comment: ProjectFileCatComment;
  issuesEnabled: boolean;
  issueSheetService?: IssueSheetService;
}): Promise<void> {
  if (!input.issuesEnabled || input.comment.type !== "issue") {
    return;
  }

  const service = input.issueSheetService ?? new IssueSheetService();
  const body: IssueSheetCreateIssueBody = {
    title: buildIssueTitle(input.comment.text),
    description: input.comment.text,
    issueType: resolveIssueType(input.issueType),
    status: "open",
    targetLocale: input.targetLocale,
    sourcePath: input.sourcePath,
    segmentId: input.translationKeyId,
    translationKeyId: input.translationKeyId,
    linkedCommentId: input.comment.externalCommentId,
    linkKind: "cat_segment",
    linkLabel: "Open in CAT",
    linkUrl: buildCatSegmentLinkUrl({
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      segmentId: input.translationKeyId,
    }),
  };

  try {
    await service.createIssue({
      organizationId: input.organizationId,
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      body,
    });
  } catch (error) {
    log.error(
      {
        err: error,
        organizationId: input.organizationId,
        projectId: input.projectId,
        translationKeyId: input.translationKeyId,
        linkedCommentId: input.comment.externalCommentId,
      },
      "failed to create Issues row from native CAT raise-issue comment",
    );
  }
}
