import { buildProviderReviewThreadId } from "@/lib/providers/provider-job-review/build-thread-id";
import type {
  ProviderReviewAuthor,
  ProviderReviewComment,
  ProviderReviewThread,
  ProviderReviewThreadState,
} from "@/lib/providers/provider-job-review/types";

import type { PhraseKeyComment, PhraseUserPreview } from "./phrase-api";
import type { PhraseTmsConversation, PhraseTmsConversationUser } from "./phrase-tms-api";

export function buildPhraseTmsJobProviderUrl(input: {
  tmsBaseUrl: string;
  projectUid: string;
  jobUid: string;
}) {
  const base = input.tmsBaseUrl.replace(/\/+$/g, "");
  return `${base}/project2/translate/${encodeURIComponent(input.projectUid)}/job/${encodeURIComponent(input.jobUid)}`;
}

export function buildPhraseStringsKeyProviderUrl(input: {
  accountSlug: string | null;
  projectSlug: string | null;
  keyId: string;
}) {
  if (!input.accountSlug || !input.projectSlug) {
    return null;
  }

  return `https://app.phrase.com/accounts/${input.accountSlug}/projects/${input.projectSlug}/keys/${encodeURIComponent(input.keyId)}`;
}

function mapPhraseTmsUser(
  user: PhraseTmsConversationUser | null | undefined,
): ProviderReviewAuthor | null {
  if (!user) {
    return null;
  }

  const externalUserId = user.uid?.trim() || user.userName?.trim() || null;
  if (!externalUserId) {
    return null;
  }

  const displayName = [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");

  return {
    externalUserId,
    username: user.userName?.trim() || null,
    displayName: displayName || user.userName?.trim() || null,
  };
}

function mapPhraseStringsUser(
  user: PhraseUserPreview | null | undefined,
): ProviderReviewAuthor | null {
  if (!user?.id) {
    return null;
  }

  return {
    externalUserId: user.id,
    username: user.username?.trim() || null,
    displayName: user.name?.trim() || user.username?.trim() || null,
  };
}

function mapTmsConversationState(state: PhraseTmsConversation["state"]): ProviderReviewThreadState {
  if (state === "resolved") {
    return "resolved";
  }
  if (state === "open") {
    return "open";
  }
  return "unknown";
}

function buildTmsConversationComments(
  conversation: PhraseTmsConversation,
): ProviderReviewComment[] {
  return conversation.comments.map((comment) => ({
    externalCommentId: comment.id,
    body: comment.text,
    author: mapPhraseTmsUser(comment.author),
    createdAt: comment.createdAt ?? null,
    updatedAt: comment.updatedAt ?? comment.createdAt ?? null,
  }));
}

function buildLqaIssueType(conversation: PhraseTmsConversation): string | null {
  const lqa = conversation.lqaReference;
  if (!lqa) {
    return null;
  }

  const parts: string[] = [];
  if (lqa.errorCategoryId != null) {
    parts.push(`category:${lqa.errorCategoryId}`);
  }
  if (lqa.severityId != null) {
    parts.push(`severity:${lqa.severityId}`);
  }
  if (lqa.repeated) {
    parts.push(`repeated:${lqa.repeated}`);
  }

  return parts.length > 0 ? parts.join(",") : null;
}

function pickConversationSubject(conversation: PhraseTmsConversation): string | null {
  if (conversation.description?.trim()) {
    return conversation.description.trim();
  }

  return conversation.comments[0]?.text ?? null;
}

function pickLatestTimestamp(conversation: PhraseTmsConversation): string | null {
  const timestamps = [
    conversation.updatedAt,
    conversation.resolvedAt,
    conversation.createdAt,
    ...conversation.comments.flatMap((comment) => [comment.updatedAt, comment.createdAt]),
  ].filter((value): value is string => Boolean(value?.trim()));

  if (timestamps.length === 0) {
    return null;
  }

  return timestamps.sort().at(-1) ?? null;
}

export function normalizePhraseLqaConversationToThread(input: {
  conversation: PhraseTmsConversation;
  externalProjectId: string;
  externalJobId: string;
  jobProviderUrl: string | null;
  targetLocale?: string | null;
}): ProviderReviewThread | null {
  if (input.conversation.deleted || !input.conversation.id.trim()) {
    return null;
  }

  const externalThreadId = `tms-lqa:${input.conversation.id}`;
  const segmentId = input.conversation.lqaReference?.segmentId?.trim() || null;
  const comments = buildTmsConversationComments(input.conversation);
  const firstCommentId = comments[0]?.externalCommentId ?? input.conversation.id;

  return {
    threadId: buildProviderReviewThreadId({
      providerKind: "phrase",
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      kind: "issue",
      externalThreadId,
    }),
    kind: "issue",
    state: mapTmsConversationState(input.conversation.state),
    subject: pickConversationSubject(input.conversation),
    issueType: buildLqaIssueType(input.conversation),
    item: segmentId
      ? {
          externalStringId: segmentId,
          key: segmentId,
          locale: input.targetLocale ?? undefined,
          field: "target",
        }
      : null,
    locale: input.targetLocale ?? null,
    comments,
    author: mapPhraseTmsUser(input.conversation.author),
    resolver: mapPhraseTmsUser(input.conversation.resolver),
    createdAt: input.conversation.createdAt ?? null,
    updatedAt: pickLatestTimestamp(input.conversation),
    resolvedAt: input.conversation.resolvedAt ?? null,
    providerContext: {
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      externalThreadId,
      externalCommentId: firstCommentId,
      providerUrl: input.jobProviderUrl,
    },
  };
}

export function normalizePhrasePlainConversationToThread(input: {
  conversation: PhraseTmsConversation;
  externalProjectId: string;
  externalJobId: string;
  jobProviderUrl: string | null;
}): ProviderReviewThread | null {
  if (input.conversation.deleted || !input.conversation.id.trim()) {
    return null;
  }

  const externalThreadId = `tms-plain:${input.conversation.id}`;
  const comments = buildTmsConversationComments(input.conversation);
  const firstCommentId = comments[0]?.externalCommentId ?? input.conversation.id;

  return {
    threadId: buildProviderReviewThreadId({
      providerKind: "phrase",
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      kind: "comment",
      externalThreadId,
    }),
    kind: "comment",
    state: mapTmsConversationState(input.conversation.state),
    subject: pickConversationSubject(input.conversation),
    comments,
    author: mapPhraseTmsUser(input.conversation.author),
    resolver: mapPhraseTmsUser(input.conversation.resolver),
    createdAt: input.conversation.createdAt ?? null,
    updatedAt: pickLatestTimestamp(input.conversation),
    resolvedAt: input.conversation.resolvedAt ?? null,
    providerContext: {
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      externalThreadId,
      externalCommentId: firstCommentId,
      providerUrl: input.jobProviderUrl,
    },
  };
}

export function normalizePhraseKeyCommentToThread(input: {
  comment: PhraseKeyComment;
  replies: PhraseKeyComment[];
  keyId: string;
  externalProjectId: string;
  externalJobId: string;
  stringKeyById: Map<string, string>;
  keyProviderUrl: string | null;
}): ProviderReviewThread | null {
  if (!input.comment.id.trim() || !input.comment.message.trim()) {
    return null;
  }

  const externalThreadId = `strings-key:${input.keyId}:${input.comment.id}`;
  const stringKey = input.stringKeyById.get(input.keyId) ?? input.keyId;
  const locale =
    input.comment.locales[0]?.code?.trim() || input.comment.locales[0]?.name?.trim() || null;

  const comments: ProviderReviewComment[] = [
    {
      externalCommentId: input.comment.id,
      body: input.comment.message,
      author: mapPhraseStringsUser(input.comment.user),
      createdAt: input.comment.createdAt ?? null,
      updatedAt: input.comment.updatedAt ?? input.comment.createdAt ?? null,
    },
    ...input.replies
      .filter((reply) => reply.id.trim() && reply.message.trim())
      .map((reply) => ({
        externalCommentId: reply.id,
        body: reply.message,
        author: mapPhraseStringsUser(reply.user),
        createdAt: reply.createdAt ?? null,
        updatedAt: reply.updatedAt ?? reply.createdAt ?? null,
      })),
  ];

  return {
    threadId: buildProviderReviewThreadId({
      providerKind: "phrase",
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      kind: "comment",
      externalThreadId,
    }),
    kind: "comment",
    state: "unknown",
    subject: input.comment.message,
    item: {
      externalStringId: input.keyId,
      key: stringKey,
      locale: locale ?? undefined,
      field: "target",
    },
    locale,
    comments,
    author: mapPhraseStringsUser(input.comment.user),
    createdAt: input.comment.createdAt ?? null,
    updatedAt: input.comment.updatedAt ?? input.comment.createdAt ?? null,
    providerContext: {
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      externalThreadId,
      externalCommentId: input.comment.id,
      providerUrl: input.keyProviderUrl,
    },
  };
}
