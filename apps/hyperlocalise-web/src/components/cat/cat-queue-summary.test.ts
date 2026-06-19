import { describe, expect, it } from "vite-plus/test";

import { adjustQueueSummaryForStatusChange, applyGlossaryTermToTarget } from "./cat-queue-summary";

describe("adjustQueueSummaryForStatusChange", () => {
  const summary = {
    total: 100,
    reviewed: 20,
    untranslated: 30,
    needsReview: 50,
    hasIssues: 5,
  };

  it("moves a pending segment into reviewed", () => {
    expect(adjustQueueSummaryForStatusChange(summary, "pending", "reviewed")).toEqual({
      total: 100,
      reviewed: 21,
      untranslated: 29,
      needsReview: 50,
      hasIssues: 5,
    });
  });

  it("moves a needs_review segment into reviewed", () => {
    expect(adjustQueueSummaryForStatusChange(summary, "needs_review", "reviewed")).toEqual({
      total: 100,
      reviewed: 21,
      untranslated: 30,
      needsReview: 49,
      hasIssues: 5,
    });
  });
});

describe("applyGlossaryTermToTarget", () => {
  it("replaces the source term in an existing target", () => {
    expect(
      applyGlossaryTermToTarget("Workspace settings for Workspace", "Dang nhap Workspace", {
        source: "Workspace",
        target: "Khong gian lam viec",
        approved: true,
        forbidden: false,
      }),
    ).toBe("Dang nhap Khong gian lam viec");
  });

  it("replaces every source term occurrence in an existing target", () => {
    expect(
      applyGlossaryTermToTarget(
        "Workspace settings for this Workspace",
        "Workspace settings for this Workspace",
        {
          source: "Workspace",
          target: "Khong gian lam viec",
          approved: true,
          forbidden: false,
        },
      ),
    ).toBe("Khong gian lam viec settings for this Khong gian lam viec");
  });

  it("derives a target from the source when the editor is empty", () => {
    expect(
      applyGlossaryTermToTarget("Workspace settings for Workspace", "", {
        source: "Workspace",
        target: "Khong gian lam viec",
        approved: true,
        forbidden: false,
      }),
    ).toBe("Khong gian lam viec settings for Khong gian lam viec");
  });
});
