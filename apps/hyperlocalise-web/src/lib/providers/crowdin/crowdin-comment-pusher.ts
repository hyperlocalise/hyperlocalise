import type { ExternalTmsCommentPusher } from "@/lib/providers/provider-feedback-types";
import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import { parseHyperlocaliseFindingMarker } from "@/lib/providers/smartling/smartling-comment-write-back";

import { CrowdinApiClient, CrowdinApiError } from "./crowdin-api";
import { buildCrowdinCommentWriteBackEntries } from "./crowdin-comment-write-back";

export const pushCrowdinProviderComments: ExternalTmsCommentPusher = async ({
  externalProjectId,
  externalJobId,
  secretMaterial,
  feedback,
  knownExternalIds,
}) => {
  const client = new CrowdinApiClient({ token: secretMaterial });
  const projectId = Number(externalProjectId.trim());
  if (Number.isNaN(projectId)) {
    throw new Error("invalid_crowdin_project_id");
  }

  const locales = new Set(feedback.map((item) => item.finding.item.locale?.trim()).filter(Boolean));
  const defaultLocaleId = locales.size === 1 ? ([...locales][0] ?? null) : null;

  const { entries, failures: validationFailures } = buildCrowdinCommentWriteBackEntries({
    findings: feedback.map((item) => item.finding),
    defaultLocaleId,
  });

  const entryByFindingId = new Map(entries.map((entry) => [entry.findingId, entry]));
  const changedItems: Awaited<ReturnType<ExternalTmsCommentPusher>>["changedItems"] = [];
  const failures = [...validationFailures];
  let posted = 0;
  let skipped = 0;
  let failed = validationFailures.length;

  const stringIds = [...new Set(entries.map((entry) => entry.request.stringId))];
  const remoteCommentIdsByFindingId = new Map<string, string>();

  if (stringIds.length > 0) {
    try {
      const remoteIssues = await client.listStringComments(projectId, {
        type: "issue",
        issueStatus: "unresolved",
      });

      for (const comment of remoteIssues) {
        if (!stringIds.includes(comment.stringId)) {
          continue;
        }

        const findingId = parseHyperlocaliseFindingMarker(comment.text);
        if (findingId) {
          remoteCommentIdsByFindingId.set(findingId, String(comment.id));
        }
      }
    } catch (error) {
      if (error instanceof CrowdinApiError && error.status === 401) {
        throw new Error("crowdin_auth_invalid");
      }
      throw error;
    }
  }

  for (const item of feedback) {
    const findingId = item.findingId || buildFindingId(item.finding);
    const entry = entryByFindingId.get(findingId);
    if (!entry) {
      continue;
    }

    const known = knownExternalIds.get(findingId) ?? null;
    const remoteCommentId = remoteCommentIdsByFindingId.get(findingId) ?? null;
    const existingCommentId = known?.commentUid ?? known?.issueUid ?? remoteCommentId;

    if (existingCommentId) {
      skipped += 1;
      changedItems.push({
        type: "provider_comment",
        findingId,
        status: "skipped",
        externalIssueUid: existingCommentId,
        externalCommentUid: existingCommentId,
        hashcode: String(entry.request.stringId),
        locale: entry.request.targetLanguageId,
        message: "provider_comment_already_exists",
        providerReviewContext: item.providerReviewContext ?? {
          externalProjectId,
          externalJobId,
          externalThreadId: existingCommentId,
          externalCommentId: existingCommentId,
        },
      });
      continue;
    }

    try {
      const created = await client.addStringComment(projectId, entry.request);
      const commentId = String(created.id);
      posted += 1;
      changedItems.push({
        type: "provider_comment",
        findingId,
        status: "posted",
        externalIssueUid: commentId,
        externalCommentUid: commentId,
        hashcode: String(entry.request.stringId),
        locale: entry.request.targetLanguageId,
        providerReviewContext: item.providerReviewContext ?? {
          externalProjectId,
          externalJobId,
          externalThreadId: commentId,
          externalCommentId: commentId,
        },
      });
    } catch (error) {
      failed += 1;
      const message =
        error instanceof Error ? error.message : "crowdin_provider_comment_create_failed";
      failures.push({ findingId, message });
      changedItems.push({
        type: "provider_comment",
        findingId,
        status: "failed",
        hashcode: String(entry.request.stringId),
        locale: entry.request.targetLanguageId,
        message,
        providerReviewContext: item.providerReviewContext,
      });
    }
  }

  return {
    posted,
    skipped,
    failed,
    changedItems,
    failures,
  };
};
