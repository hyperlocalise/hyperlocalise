import { buildProviderReviewThreadId } from "@/lib/providers/provider-job-review/build-thread-id";
import type {
  ProviderReviewThread,
  ProviderReviewThreadKind,
  ProviderReviewThreadState,
} from "@/lib/providers/provider-job-review/types";

import type { SmartlingIssue } from "./smartling-api";

function mapIssueState(issueStateCode: string | null | undefined): ProviderReviewThreadState {
  const normalized = issueStateCode?.trim().toUpperCase() ?? "";
  if (normalized === "RESOLVED" || normalized === "CLOSED") {
    return "resolved";
  }
  if (normalized === "OPENED" || normalized === "OPEN") {
    return "open";
  }
  return "unknown";
}

export function normalizeSmartlingIssueToThread(input: {
  issue: SmartlingIssue;
  externalProjectId: string;
  externalJobId: string;
  stringKeyById: Map<string, string>;
  projectWebUrl: string | null;
}): ProviderReviewThread {
  const hashcode = input.issue.string?.hashcode?.trim() ?? "";
  const kind: ProviderReviewThreadKind = "issue";
  const externalThreadId = input.issue.issueUid;
  const stringKey = input.stringKeyById.get(hashcode) ?? hashcode;

  return {
    threadId: buildProviderReviewThreadId({
      providerKind: "smartling",
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      kind,
      externalThreadId,
    }),
    kind,
    state: mapIssueState(input.issue.issueStateCode),
    subject: input.issue.issueText ?? "",
    issueType: input.issue.issueTypeCode ?? null,
    item: {
      externalStringId: hashcode,
      key: stringKey,
      locale: input.issue.string?.localeId || undefined,
      field: "target",
    },
    locale: input.issue.string?.localeId ?? null,
    comments: [
      {
        externalCommentId: externalThreadId,
        body: input.issue.issueText ?? "",
        createdAt: null,
        updatedAt: null,
      },
    ],
    createdAt: null,
    updatedAt: null,
    providerContext: {
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      externalThreadId,
      externalCommentId: externalThreadId,
      providerUrl: input.projectWebUrl,
    },
  };
}
