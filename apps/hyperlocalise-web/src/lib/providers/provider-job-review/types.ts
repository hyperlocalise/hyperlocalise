import type { ProviderQaItemReference } from "@/lib/providers/provider-job-qa/types";

export const providerReviewThreadKinds = ["issue", "comment", "task_comment"] as const;

export type ProviderReviewThreadKind = (typeof providerReviewThreadKinds)[number];

export const providerReviewThreadStates = ["open", "resolved", "unknown"] as const;

export type ProviderReviewThreadState = (typeof providerReviewThreadStates)[number];

export type ProviderReviewAuthor = {
  externalUserId?: string | null;
  username?: string | null;
  displayName?: string | null;
};

export type ProviderReviewComment = {
  externalCommentId: string;
  body: string;
  author?: ProviderReviewAuthor | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ProviderReviewContext = {
  externalProjectId: string;
  externalJobId: string;
  externalThreadId: string;
  externalCommentId?: string | null;
  providerUrl?: string | null;
};

export type ProviderReviewThread = {
  threadId: string;
  kind: ProviderReviewThreadKind;
  state: ProviderReviewThreadState;
  subject?: string | null;
  issueType?: string | null;
  item?: ProviderQaItemReference | null;
  locale?: string | null;
  comments: ProviderReviewComment[];
  author?: ProviderReviewAuthor | null;
  resolver?: ProviderReviewAuthor | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  resolvedAt?: string | null;
  providerContext: ProviderReviewContext;
};

export type ProviderReviewSummary = {
  total: number;
  open: number;
  resolved: number;
  byKind: Partial<Record<ProviderReviewThreadKind, number>>;
};

export type ProviderReviewReport = {
  threads: ProviderReviewThread[];
  summary: ProviderReviewSummary;
};
