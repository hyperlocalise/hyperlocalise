import { describe, expect, it } from "vite-plus/test";

import type { CrowdinStringComment, CrowdinTaskComment } from "./crowdin-api";
import {
  buildCrowdinStringCommentProviderUrl,
  buildCrowdinTaskCommentProviderUrl,
  normalizeCrowdinStringCommentToThread,
  normalizeCrowdinTaskCommentToThread,
} from "./crowdin-review-normalize";

describe("crowdin review normalization", () => {
  it("maps string issues with resolution state and provider links", () => {
    const comment: CrowdinStringComment = {
      id: 42,
      text: "Wrong tense",
      userId: 7,
      stringId: 100,
      languageId: "de",
      type: "issue",
      issueType: "translation_mistake",
      issueStatus: "unresolved",
      resolverId: null,
      resolver: null,
      user: {
        id: 7,
        username: "reviewer",
        fullName: "Reviewer",
      },
      resolvedAt: null,
      createdAt: "2026-05-01T10:00:00Z",
      projectId: 1,
    };

    const thread = normalizeCrowdinStringCommentToThread({
      comment,
      externalProjectId: "1",
      externalJobId: "9",
      projectWebUrl: "https://crowdin.com/project/demo",
      stringKeyById: new Map([["100", "welcome.title"]]),
    });

    expect(thread.kind).toBe("issue");
    expect(thread.state).toBe("open");
    expect(thread.item).toEqual({
      externalStringId: "100",
      key: "welcome.title",
      locale: "de",
      field: "target",
    });
    expect(thread.providerContext.providerUrl).toBe(
      buildCrowdinStringCommentProviderUrl({
        projectWebUrl: "https://crowdin.com/project/demo",
        stringId: 100,
        commentId: 42,
      }),
    );
  });

  it("maps resolved issues and plain comments", () => {
    const resolved: CrowdinStringComment = {
      id: 43,
      text: "Resolved issue",
      userId: 1,
      stringId: 101,
      languageId: "fr",
      type: "issue",
      issueStatus: "resolved",
      createdAt: "2026-05-01T10:00:00Z",
      projectId: 1,
      resolvedAt: "2026-05-02T10:00:00Z",
    };

    const plainComment: CrowdinStringComment = {
      id: 44,
      text: "FYI",
      userId: 2,
      stringId: 102,
      languageId: "fr",
      type: "comment",
      createdAt: "2026-05-03T10:00:00Z",
      projectId: 1,
    };

    const resolvedThread = normalizeCrowdinStringCommentToThread({
      comment: resolved,
      externalProjectId: "1",
      externalJobId: "9",
      projectWebUrl: "https://crowdin.com/project/demo",
      stringKeyById: new Map(),
    });

    const commentThread = normalizeCrowdinStringCommentToThread({
      comment: plainComment,
      externalProjectId: "1",
      externalJobId: "9",
      projectWebUrl: "https://crowdin.com/project/demo",
      stringKeyById: new Map([["102", "cta.label"]]),
    });

    expect(resolvedThread.state).toBe("resolved");
    expect(commentThread.kind).toBe("comment");
    expect(commentThread.state).toBe("unknown");
    expect(commentThread.item?.key).toBe("cta.label");
  });

  it("maps task comments with task web urls", () => {
    const comment: CrowdinTaskComment = {
      id: 5,
      userId: 3,
      taskId: 9,
      text: "Please finish review",
      createdAt: "2026-05-04T10:00:00Z",
      updatedAt: "2026-05-04T11:00:00Z",
    };

    const thread = normalizeCrowdinTaskCommentToThread({
      comment,
      externalProjectId: "1",
      externalJobId: "9",
      taskWebUrl: "https://crowdin.com/project/demo/tasks/9",
    });

    expect(thread.kind).toBe("task_comment");
    expect(thread.providerContext.providerUrl).toBe(
      buildCrowdinTaskCommentProviderUrl({
        taskWebUrl: "https://crowdin.com/project/demo/tasks/9",
        commentId: 5,
      }),
    );
  });
});
