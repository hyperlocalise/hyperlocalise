import { describe, expect, it } from "vite-plus/test";

import {
  canApplySelectedPages,
  pageHasPullableTranslations,
  selectedPagesCollected,
  selectedPagesMissingFromCollect,
  type FigmaLocaleStatus,
} from "./figma-locale-status";

function locale(input: {
  locale?: string;
  isSource?: boolean;
  pages: FigmaLocaleStatus["pages"];
}): FigmaLocaleStatus {
  return {
    locale: input.locale ?? "vi-VN",
    isSource: input.isSource ?? false,
    pages: input.pages,
  };
}

describe("pageHasPullableTranslations", () => {
  it("allows source pages only after succeeded ingest", () => {
    const entry = locale({ isSource: true, pages: [] });
    expect(pageHasPullableTranslations(entry, { pageId: "1:1", status: "succeeded" })).toBe(true);
    expect(
      pageHasPullableTranslations(entry, { pageId: "1:1", status: "waiting_for_review" }),
    ).toBe(false);
  });

  it("allows target pages that succeeded or are waiting for review", () => {
    const entry = locale({ pages: [] });
    expect(pageHasPullableTranslations(entry, { pageId: "1:1", status: "succeeded" })).toBe(true);
    expect(
      pageHasPullableTranslations(entry, { pageId: "1:1", status: "waiting_for_review" }),
    ).toBe(true);
    expect(pageHasPullableTranslations(entry, { pageId: "1:1", status: "running" })).toBe(false);
    expect(pageHasPullableTranslations(entry, { pageId: "1:1", status: "missing" })).toBe(false);
  });
});

describe("selected page apply gates", () => {
  const collected = locale({
    pages: [
      { pageId: "1:1", status: "succeeded" },
      { pageId: "1:2", status: "waiting_for_review" },
      { pageId: "1:3", status: "missing" },
    ],
  });

  it("treats missing and unknown pages as not collected", () => {
    expect(selectedPagesMissingFromCollect(undefined, ["1:1"])).toEqual(["1:1"]);
    expect(selectedPagesMissingFromCollect(collected, ["1:1", "1:3", "9:9"])).toEqual([
      "1:3",
      "9:9",
    ]);
    expect(selectedPagesCollected(collected, ["1:1", "1:2"])).toBe(true);
    expect(selectedPagesCollected(collected, ["1:1", "1:3"])).toBe(false);
    expect(selectedPagesCollected(collected, [])).toBe(false);
  });

  it("enables Apply only when every selected page is pullable", () => {
    expect(canApplySelectedPages(undefined, ["1:1"])).toBe(false);
    expect(canApplySelectedPages(collected, [])).toBe(false);
    expect(canApplySelectedPages(collected, ["1:1", "1:2"])).toBe(true);
    expect(canApplySelectedPages(collected, ["1:1", "1:3"])).toBe(false);
    expect(canApplySelectedPages(collected, ["1:1", "missing-page"])).toBe(false);
  });

  it("does not treat waiting_for_review as pullable on the source locale", () => {
    const source = locale({
      isSource: true,
      pages: [{ pageId: "1:1", status: "waiting_for_review" }],
    });
    expect(canApplySelectedPages(source, ["1:1"])).toBe(false);
  });
});
