import { describe, expect, it } from "vite-plus/test";

import type { PhraseKeyComment } from "./phrase-api";
import type { PhraseTmsConversation } from "./phrase-tms-api";
import {
  buildPhraseStringsKeyProviderUrl,
  buildPhraseTmsJobProviderUrl,
  normalizePhraseKeyCommentToThread,
  normalizePhraseLqaConversationToThread,
  normalizePhrasePlainConversationToThread,
} from "./phrase-review-normalize";

describe("phrase review normalization", () => {
  it("maps LQA issues with resolution state, segment refs, and provider links", () => {
    const conversation: PhraseTmsConversation = {
      id: "lqa-1",
      type: "lqa",
      description: "Wrong terminology",
      deleted: false,
      createdAt: "2026-05-01T10:00:00Z",
      updatedAt: "2026-05-02T10:00:00Z",
      resolvedAt: null,
      state: "open",
      author: {
        uid: "user-1",
        userName: "reviewer",
        firstName: "Review",
        lastName: "Er",
        email: null,
      },
      resolver: null,
      comments: [
        {
          id: "comment-1",
          text: "Please fix",
          createdAt: "2026-05-01T10:00:00Z",
          updatedAt: null,
          author: null,
        },
      ],
      lqaReference: {
        segmentId: "segment-42",
        commentedText: "Hallo",
        errorCategoryId: 3,
        severityId: 2,
        repeated: "no",
      },
    };

    const thread = normalizePhraseLqaConversationToThread({
      conversation,
      externalProjectId: "project-1",
      externalJobId: "phrase-job-1-task-fr-fr",
      jobProviderUrl: buildPhraseTmsJobProviderUrl({
        tmsBaseUrl: "https://cloud.memsource.com/web",
        projectUid: "tms-project-1",
        jobUid: "job-fr",
      }),
      targetLocale: "fr-FR",
    });

    expect(thread?.kind).toBe("issue");
    expect(thread?.state).toBe("open");
    expect(thread?.issueType).toBe("category:3,severity:2,repeated:no");
    expect(thread?.item).toEqual({
      externalStringId: "segment-42",
      key: "segment-42",
      locale: "fr-FR",
      field: "target",
    });
    expect(thread?.providerContext.providerUrl).toBe(
      "https://cloud.memsource.com/web/project2/translate/tms-project-1/job/job-fr",
    );
  });

  it("skips deleted conversations and maps resolved plain comments", () => {
    const deleted: PhraseTmsConversation = {
      id: "plain-deleted",
      type: "plain",
      description: "gone",
      deleted: true,
      createdAt: null,
      updatedAt: null,
      resolvedAt: null,
      state: "unknown",
      author: null,
      resolver: null,
      comments: [],
      lqaReference: null,
    };

    const resolved: PhraseTmsConversation = {
      id: "plain-1",
      type: "plain",
      description: null,
      deleted: false,
      createdAt: "2026-05-03T10:00:00Z",
      updatedAt: "2026-05-04T10:00:00Z",
      resolvedAt: "2026-05-04T10:00:00Z",
      state: "resolved",
      author: {
        uid: "user-2",
        userName: "pm",
        firstName: null,
        lastName: null,
        email: null,
      },
      resolver: {
        uid: "user-3",
        userName: "lead",
        firstName: "Team",
        lastName: "Lead",
        email: null,
      },
      comments: [
        {
          id: "comment-2",
          text: "Looks good now",
          createdAt: "2026-05-03T10:00:00Z",
          updatedAt: "2026-05-04T10:00:00Z",
          author: null,
        },
      ],
      lqaReference: null,
    };

    expect(
      normalizePhrasePlainConversationToThread({
        conversation: deleted,
        externalProjectId: "project-1",
        externalJobId: "phrase-job-1-task-fr-fr",
        jobProviderUrl: null,
      }),
    ).toBeNull();

    const thread = normalizePhrasePlainConversationToThread({
      conversation: resolved,
      externalProjectId: "project-1",
      externalJobId: "phrase-job-1-task-fr-fr",
      jobProviderUrl: null,
    });

    expect(thread?.kind).toBe("comment");
    expect(thread?.state).toBe("resolved");
    expect(thread?.resolver?.displayName).toBe("Team Lead");
    expect(thread?.subject).toBe("Looks good now");
  });

  it("maps strings key comments with replies and tolerates missing author metadata", () => {
    const comment: PhraseKeyComment = {
      id: "comment-root",
      message: "Check pluralization",
      hasReplies: true,
      user: null,
      createdAt: "2026-05-05T10:00:00Z",
      updatedAt: null,
      locales: [{ id: "locale-1", name: "German", code: "de" }],
    };

    const reply: PhraseKeyComment = {
      id: "comment-reply",
      message: "Updated",
      hasReplies: false,
      user: {
        id: "user-9",
        username: "translator",
        name: "Translator",
      },
      createdAt: "2026-05-05T11:00:00Z",
      updatedAt: null,
      locales: [],
    };

    const thread = normalizePhraseKeyCommentToThread({
      comment,
      replies: [reply],
      keyId: "key-1",
      externalProjectId: "project-1",
      externalJobId: "phrase-job-1-task-de-de",
      stringKeyById: new Map([["key-1", "welcome.title"]]),
      keyProviderUrl: buildPhraseStringsKeyProviderUrl({
        accountSlug: "acme",
        projectSlug: "demo",
        keyId: "key-1",
      }),
    });

    expect(thread?.item?.key).toBe("welcome.title");
    expect(thread?.locale).toBe("de");
    expect(thread?.comments).toHaveLength(2);
    expect(thread?.author).toBeNull();
    expect(thread?.providerContext.providerUrl).toBe(
      "https://app.phrase.com/accounts/acme/projects/demo/keys/key-1",
    );
  });
});
