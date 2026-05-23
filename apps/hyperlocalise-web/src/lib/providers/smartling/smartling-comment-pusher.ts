import type { ExternalTmsCommentPusher } from "@/lib/providers/provider-feedback-types";
import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";

import {
  buildSmartlingCommentWriteBackEntries,
  parseHyperlocaliseFindingMarker,
} from "./smartling-comment-write-back";
import { SmartlingApiClient, SmartlingApiError } from "./smartling-api";
import { mapSmartlingFetcherError } from "./smartling-errors";

export const pushSmartlingProviderComments: ExternalTmsCommentPusher = async ({
  externalProjectId,
  secretMaterial,
  feedback,
  knownExternalIds,
}) => {
  const client = new SmartlingApiClient({ credentials: secretMaterial });
  const projectId = externalProjectId.trim();

  if (!projectId) {
    throw new Error("invalid_smartling_project_id");
  }

  const defaultLocaleId =
    feedback.find((item) => item.finding.item.locale?.trim())?.finding.item.locale?.trim() ?? null;

  const { entries, failures: validationFailures } = buildSmartlingCommentWriteBackEntries({
    findings: feedback.map((item) => item.finding),
    defaultLocaleId,
  });

  const entryByFindingId = new Map(entries.map((entry) => [entry.findingId, entry]));
  const changedItems: Awaited<ReturnType<ExternalTmsCommentPusher>>["changedItems"] = [];
  const failures = [...validationFailures];
  let posted = 0;
  let skipped = 0;
  let failed = validationFailures.length;

  const hashcodes = [
    ...new Set(
      entries
        .map((entry) => entry.issueTemplate.string.hashcode)
        .filter((hashcode) => hashcode.length > 0),
    ),
  ];

  const remoteIssueIdsByFindingId = new Map<string, string>();
  if (hashcodes.length > 0) {
    try {
      const remoteIssues = await client.listIssues(projectId, {
        stringFilter: { hashcodes },
        limit: 500,
      });

      for (const issue of remoteIssues) {
        const findingId = parseHyperlocaliseFindingMarker(issue.issueText);
        if (findingId && issue.issueUid) {
          remoteIssueIdsByFindingId.set(findingId, issue.issueUid);
        }
      }
    } catch (error) {
      if (error instanceof SmartlingApiError && error.status === 401) {
        throw new Error("smartling_auth_invalid");
      }
      throw mapSmartlingFetcherError(error);
    }
  }

  for (const item of feedback) {
    const findingId = item.findingId || buildFindingId(item.finding);
    const entry = entryByFindingId.get(findingId);
    if (!entry) {
      continue;
    }

    const known = knownExternalIds.get(findingId) ?? null;
    const remoteIssueUid = remoteIssueIdsByFindingId.get(findingId) ?? null;
    const existingIssueUid = known?.issueUid ?? remoteIssueUid;

    if (existingIssueUid) {
      skipped += 1;
      changedItems.push({
        type: "provider_comment",
        findingId,
        status: "skipped",
        externalIssueUid: existingIssueUid,
        externalCommentUid: known?.commentUid ?? null,
        hashcode: entry.issueTemplate.string.hashcode,
        locale: entry.issueTemplate.string.localeId,
        message: "provider_comment_already_exists",
      });
      continue;
    }

    try {
      const issue = await client.createIssue(projectId, entry.issueTemplate);
      if (!issue.issueUid) {
        failed += 1;
        failures.push({
          findingId,
          message: "smartling_issue_missing_uid",
        });
        changedItems.push({
          type: "provider_comment",
          findingId,
          status: "failed",
          hashcode: entry.issueTemplate.string.hashcode,
          locale: entry.issueTemplate.string.localeId,
          message: "smartling_issue_missing_uid",
        });
        continue;
      }

      posted += 1;
      changedItems.push({
        type: "provider_comment",
        findingId,
        status: "posted",
        externalIssueUid: issue.issueUid,
        externalCommentUid: null,
        hashcode: entry.issueTemplate.string.hashcode,
        locale: entry.issueTemplate.string.localeId,
      });
    } catch (error) {
      failed += 1;
      const message =
        error instanceof Error ? error.message : "smartling_provider_comment_create_failed";
      failures.push({ findingId, message });
      changedItems.push({
        type: "provider_comment",
        findingId,
        status: "failed",
        hashcode: entry.issueTemplate.string.hashcode,
        locale: entry.issueTemplate.string.localeId,
        message,
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
