import { buildProviderReviewThreadId } from "@/lib/providers/provider-job-review/build-thread-id";
import type {
  ProviderReviewAuthor,
  ProviderReviewThread,
} from "@/lib/providers/provider-job-review/types";

import { buildLokaliseKeyCommentProviderUrl, type LokaliseComment } from "./lokalise-api";

function mapLokaliseCommentAuthor(comment: LokaliseComment): ProviderReviewAuthor | null {
  if (comment.addedBy == null && !comment.addedByEmail) {
    return null;
  }

  return {
    externalUserId: comment.addedBy != null ? String(comment.addedBy) : null,
    displayName: comment.addedByEmail,
    username: comment.addedByEmail,
  };
}

export function normalizeLokaliseKeyCommentToThread(input: {
  comment: LokaliseComment;
  externalProjectId: string;
  externalJobId: string;
  stringKeyById: Map<string, string>;
}): ProviderReviewThread {
  const externalThreadId = String(input.comment.commentId);
  const stringKey =
    input.stringKeyById.get(String(input.comment.keyId)) ?? String(input.comment.keyId);

  return {
    threadId: buildProviderReviewThreadId({
      providerKind: "lokalise",
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      kind: "comment",
      externalThreadId,
    }),
    kind: "comment",
    state: "unknown",
    subject: input.comment.comment,
    item: {
      externalStringId: String(input.comment.keyId),
      key: stringKey,
      field: "target",
    },
    comments: [
      {
        externalCommentId: externalThreadId,
        body: input.comment.comment,
        author: mapLokaliseCommentAuthor(input.comment),
        createdAt: input.comment.addedAt,
        updatedAt: input.comment.addedAt,
      },
    ],
    author: mapLokaliseCommentAuthor(input.comment),
    createdAt: input.comment.addedAt,
    updatedAt: input.comment.addedAt,
    providerContext: {
      externalProjectId: input.externalProjectId,
      externalJobId: input.externalJobId,
      externalThreadId,
      externalCommentId: externalThreadId,
      providerUrl: buildLokaliseKeyCommentProviderUrl({
        projectId: input.externalProjectId,
        taskId: input.externalJobId,
        keyId: input.comment.keyId,
        commentId: input.comment.commentId,
      }),
    },
  };
}
