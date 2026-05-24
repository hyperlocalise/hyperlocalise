import type { ExternalTmsCommentPusher } from "@/lib/providers/provider-feedback-types";
import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import { parseHyperlocaliseFindingMarker } from "@/lib/providers/smartling/smartling-comment-write-back";

import {
  buildLokaliseKeyCommentProviderUrl,
  LOKALISE_DEFAULT_BASE_URL,
  LokaliseApiClient,
  LokaliseApiError,
} from "./lokalise-api";
import { buildLokaliseCommentWriteBackEntries } from "./lokalise-comment-write-back";

export const pushLokaliseProviderComments: ExternalTmsCommentPusher = async ({
  externalProjectId,
  externalJobId,
  secretMaterial,
  feedback,
  knownExternalIds,
}) => {
  const projectId = externalProjectId.trim();
  if (!projectId) {
    throw new Error("invalid_lokalise_project_id");
  }

  const client = new LokaliseApiClient({
    token: secretMaterial,
    baseUrl: LOKALISE_DEFAULT_BASE_URL,
  });

  const locales = new Set(feedback.map((item) => item.finding.item.locale?.trim()).filter(Boolean));
  const defaultLocaleId = locales.size === 1 ? ([...locales][0] ?? null) : null;

  const { entries, failures: validationFailures } = buildLokaliseCommentWriteBackEntries({
    findings: feedback.map((item) => item.finding),
    defaultLocaleId,
  });

  const entryByFindingId = new Map(entries.map((entry) => [entry.findingId, entry]));
  const changedItems: Awaited<ReturnType<ExternalTmsCommentPusher>>["changedItems"] = [];
  const failures = [...validationFailures];
  let posted = 0;
  let skipped = 0;
  let failed = validationFailures.length;

  const keyIds = [...new Set(entries.map((entry) => entry.request.keyId))];
  const remoteCommentIdsByFindingId = new Map<string, string>();

  if (keyIds.length > 0) {
    try {
      for (const keyId of keyIds) {
        const remoteComments = await client.listKeyComments(projectId, keyId);
        for (const remoteComment of remoteComments) {
          const findingId = parseHyperlocaliseFindingMarker(remoteComment.comment);
          if (findingId) {
            remoteCommentIdsByFindingId.set(findingId, String(remoteComment.commentId));
          }
        }
      }
    } catch (error) {
      if (error instanceof LokaliseApiError && error.status === 401) {
        throw new Error("lokalise_auth_invalid");
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
        hashcode: String(entry.request.keyId),
        locale: entry.request.locale ?? undefined,
        message: "provider_comment_already_exists",
        providerReviewContext: item.providerReviewContext ?? {
          externalProjectId: projectId,
          externalJobId,
          externalThreadId: existingCommentId,
          externalCommentId: existingCommentId,
        },
      });
      continue;
    }

    try {
      const created = await client.createKeyComments(projectId, entry.request.keyId, [
        { comment: entry.request.comment },
      ]);
      const commentId = String(created[0]?.commentId ?? "");
      if (!commentId) {
        throw new Error("lokalise_provider_comment_create_failed");
      }

      posted += 1;
      changedItems.push({
        type: "provider_comment",
        findingId,
        status: "posted",
        externalIssueUid: commentId,
        externalCommentUid: commentId,
        hashcode: String(entry.request.keyId),
        locale: entry.request.locale ?? undefined,
        providerReviewContext: item.providerReviewContext ?? {
          externalProjectId: projectId,
          externalJobId,
          externalThreadId: commentId,
          externalCommentId: commentId,
          providerUrl: buildLokaliseKeyCommentProviderUrl({
            projectId,
            taskId: externalJobId,
            keyId: entry.request.keyId,
            commentId: Number(commentId),
          }),
        },
      });
    } catch (error) {
      failed += 1;
      const message =
        error instanceof Error ? error.message : "lokalise_provider_comment_create_failed";
      failures.push({ findingId, message });
      changedItems.push({
        type: "provider_comment",
        findingId,
        status: "failed",
        hashcode: String(entry.request.keyId),
        locale: entry.request.locale ?? undefined,
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
