import { describe, expect, it } from "vite-plus/test";

import { normalizeLokaliseKeyCommentToThread } from "./lokalise-review-normalize";

describe("normalizeLokaliseKeyCommentToThread", () => {
  it("maps key comments into provider review threads", () => {
    const thread = normalizeLokaliseKeyCommentToThread({
      comment: {
        commentId: 42,
        keyId: 4242,
        comment: "Please review this translation",
        addedBy: 7,
        addedByEmail: "reviewer@example.com",
        addedAt: "2026-05-01T10:00:00Z",
        addedAtTimestamp: 1746093600,
      },
      externalProjectId: "proj.123",
      externalJobId: "55392",
      stringKeyById: new Map([["4242", "welcome.title"]]),
    });

    expect(thread.kind).toBe("comment");
    expect(thread.item).toMatchObject({
      externalStringId: "4242",
      key: "welcome.title",
    });
    expect(thread.providerContext).toMatchObject({
      externalProjectId: "proj.123",
      externalJobId: "55392",
      externalCommentId: "42",
      externalThreadId: "42",
    });
    expect(thread.comments[0]?.body).toBe("Please review this translation");
  });
});
