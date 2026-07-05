import { describe, expect, it } from "vite-plus/test";

import type { CatFileContext, CatSegmentComment } from "@/components/cat/shared/types";

import { CatSegmentDraft } from "./cat-segment-draft";
import { composeSegmentView, toQueueSegment } from "./cat-segment-view";

const fileContext: CatFileContext = {
  sourcePath: "locales/en.json",
  filename: "en.json",
  sourceLocale: "en-GB",
  targetLocale: "fr-CA",
  providerKind: "crowdin",
  canEditTranslations: true,
  canAddComments: true,
};

describe("toQueueSegment", () => {
  it("strips editor fields from a full segment", () => {
    expect(
      toQueueSegment({
        id: "seg-01",
        index: 1,
        key: "hero.title",
        sourceText: "Hello",
      }),
    ).toEqual({
      id: "seg-01",
      index: 1,
      key: "hero.title",
      sourceText: "Hello",
    });
  });
});

describe("composeSegmentView", () => {
  it("uses file context locales and draft target/status", () => {
    const view = composeSegmentView({
      fileContext,
      meta: { id: "seg-01", index: 1, key: "hero.title", sourceText: "Hello" },
      draft: new CatSegmentDraft("seg-01", "Bonjour", "needs_review"),
      comments: undefined,
      intelligence: undefined,
    });

    expect(view).toMatchObject({
      id: "seg-01",
      sourceLocale: "en-GB",
      targetLocale: "fr-CA",
      targetText: "Bonjour",
      status: "needs_review",
    });
  });

  it("defaults to empty target and pending status without a draft", () => {
    const view = composeSegmentView({
      fileContext,
      meta: { id: "seg-01", index: 1, key: "hero.title", sourceText: "Hello" },
      draft: undefined,
      comments: undefined,
      intelligence: undefined,
    });

    expect(view.targetText).toBe("");
    expect(view.status).toBe("pending");
  });

  it("maps intelligence fields onto the composed segment", () => {
    const view = composeSegmentView({
      fileContext,
      meta: { id: "seg-01", index: 1, key: "hero.title", sourceText: "Hello" },
      draft: undefined,
      comments: undefined,
      intelligence: {
        glossaryTerms: [],
        productMeaning: "  Card description  ",
        maxLength: 80,
        segmentType: "card",
      },
    });

    expect(view.contextLabel).toBe("Card description");
    expect(view.maxLength).toBe(80);
    expect(view.tags).toEqual(["card"]);
  });

  it("ignores non-positive maxLength values", () => {
    const view = composeSegmentView({
      fileContext,
      meta: { id: "seg-01", index: 1, key: "hero.title", sourceText: "Hello" },
      draft: undefined,
      comments: undefined,
      intelligence: {
        glossaryTerms: [],
        maxLength: 0,
      },
    });

    expect(view.maxLength).toBeUndefined();
  });

  it("adds comment and issue tags when comments are loaded", () => {
    const comments: CatSegmentComment[] = [
      { id: "c-1", type: "comment", status: null, text: "Note", createdAt: null, locale: null },
      {
        id: "i-1",
        type: "issue",
        status: "open",
        text: "Fix this",
        createdAt: null,
        locale: null,
      },
      {
        id: "i-2",
        type: "issue",
        status: "resolved",
        text: "Done",
        createdAt: null,
        locale: null,
      },
    ];

    const view = composeSegmentView({
      fileContext,
      meta: { id: "seg-01", index: 1, key: "hero.title", sourceText: "Hello" },
      draft: undefined,
      comments,
      intelligence: { glossaryTerms: [], segmentType: "heading" },
    });

    expect(view.comments).toEqual(comments);
    expect(view.hasOpenIssues).toBe(true);
    expect(view.tags).toEqual(["heading", "3 comments", "1 issue"]);
  });
});
