import { buildProviderReviewThreadId } from "@/lib/providers/provider-job-review/build-thread-id";
import type {
  ProviderReviewAuthor,
  ProviderReviewThread,
  ProviderReviewThreadKind,
  ProviderReviewThreadState,
} from "@/lib/providers/provider-job-review/types";

import type { CrowdinShortUser, CrowdinStringComment, CrowdinTaskComment } from "./crowdin-api";

function mapCrowdinUser(user: CrowdinShortUser | null | undefined): ProviderReviewAuthor | null {
  if (!user) {
    return null;
  }

  return {
    externalUserId: String(user.id),
    username: user.username ?? null,
    displayName: user.fullName?.trim() || user.username || null,
  };
}

function mapIssueState(issueStatus: string | null | undefined): ProviderReviewThreadState {
  if (issueStatus === "resolved") {
    return "resolved";
  }
  if (issueStatus === "unresolved") {
    return "open";
  }
  return "unknown";
}

export function buildCrowdinStringCommentProviderUrl(input: {
  projectWebUrl: string;
  stringId: number;
  commentId: number;
}) {
  const base = input.projectWebUrl.replace(/\/+$/g, "");
  return `${base}/comments?commentId=${input.commentId}&stringId=${input.stringId}`;
}

export function buildCrowdinTaskCommentProviderUrl(input: {
  taskWebUrl: string;
  commentId: number;
}) {
  const base = input.taskWebUrl.replace(/\/+$/g, "");
  return `${base}#comment-${input.commentId}`;
}

export function normalizeCrowdinStringCommentToThread(input: {
  comment: CrowdinStringComment;
  externalProjectId: string;
  externalJobId: string;
  projectWebUrl: string;
  stringKeyById: Map<string, string>;
}): ProviderReviewThread {
  const kind: ProviderReviewThreadKind = input.comment.type === "issue" ? "issue" : "comment";
  const externalThreadId = String(input.comment.id);
  const stringKey =
    input.stringKeyById.get(String(input.comment.stringId)) ?? String(input.comment.stringId);

  return {
    threadId: buildProviderReviewThreadId({
      providerKind: "crowdin",
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      kind,
      externalThreadId,
    }),
    kind,
    state: kind === "issue" ? mapIssueState(input.comment.issueStatus) : "unknown",
    subject: input.comment.text,
    issueType: input.comment.issueType ?? null,
    item: {
      externalStringId: String(input.comment.stringId),
      key: stringKey,
      locale: input.comment.languageId || undefined,
      field: "target",
    },
    locale: input.comment.languageId || null,
    comments: [
      {
        externalCommentId: externalThreadId,
        body: input.comment.text,
        author: mapCrowdinUser(input.comment.user),
        createdAt: input.comment.createdAt ?? null,
        updatedAt: input.comment.resolvedAt ?? null,
      },
    ],
    author: mapCrowdinUser(input.comment.user),
    resolver: mapCrowdinUser(input.comment.resolver),
    createdAt: input.comment.createdAt ?? null,
    updatedAt: input.comment.resolvedAt ?? input.comment.createdAt ?? null,
    resolvedAt: input.comment.resolvedAt ?? null,
    providerContext: {
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      externalThreadId,
      externalCommentId: externalThreadId,
      providerUrl: buildCrowdinStringCommentProviderUrl({
        projectWebUrl: input.projectWebUrl,
        stringId: input.comment.stringId,
        commentId: input.comment.id,
      }),
    },
  };
}

export function normalizeCrowdinTaskCommentToThread(input: {
  comment: CrowdinTaskComment;
  externalProjectId: string;
  externalJobId: string;
  taskWebUrl: string;
}): ProviderReviewThread {
  const externalThreadId = String(input.comment.id);

  return {
    threadId: buildProviderReviewThreadId({
      providerKind: "crowdin",
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      kind: "task_comment",
      externalThreadId,
    }),
    kind: "task_comment",
    state: "unknown",
    subject: input.comment.text,
    comments: [
      {
        externalCommentId: externalThreadId,
        body: input.comment.text,
        author: {
          externalUserId: String(input.comment.userId),
        },
        createdAt: input.comment.createdAt ?? null,
        updatedAt: input.comment.updatedAt ?? null,
      },
    ],
    author: {
      externalUserId: String(input.comment.userId),
    },
    createdAt: input.comment.createdAt ?? null,
    updatedAt: input.comment.updatedAt ?? null,
    providerContext: {
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      externalThreadId,
      externalCommentId: externalThreadId,
      providerUrl: buildCrowdinTaskCommentProviderUrl({
        taskWebUrl: input.taskWebUrl,
        commentId: input.comment.id,
      }),
    },
  };
}
