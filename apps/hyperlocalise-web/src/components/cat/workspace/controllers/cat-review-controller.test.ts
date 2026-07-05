import type { IntlShape } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createCatWorkspaceState } from "@/components/cat/shared/cat.fixture";
import type { CatFormatCheck, CatGlossaryTerm } from "@/components/cat/shared/types";

import { createCatWorkspace } from "../cat-workspace-orchestrator";
import { CatReviewController } from "./cat-review-controller";

const intl = {
  formatMessage: (descriptor: { defaultMessage?: string }) => descriptor.defaultMessage ?? "",
} as IntlShape;

function createTestWorkspace(overrides: Parameters<typeof createCatWorkspaceState>[0] = {}) {
  return createCatWorkspace(
    createCatWorkspaceState({
      selectedSegmentId: "seg-02",
      segments: [
        {
          id: "seg-01",
          index: 1,
          key: "first",
          sourceText: "First",
          targetText: "Premier",
          sourceLocale: "en-US",
          targetLocale: "vi",
          status: "reviewed",
        },
        {
          id: "seg-02",
          index: 2,
          key: "second",
          sourceText: "Second",
          targetText: "",
          sourceLocale: "en-US",
          targetLocale: "vi",
          status: "pending",
        },
        {
          id: "seg-03",
          index: 3,
          key: "third",
          sourceText: "Third",
          targetText: "Troisième",
          sourceLocale: "en-US",
          targetLocale: "vi",
          status: "pending",
        },
      ],
      ...overrides,
    }),
  );
}

function createController(
  workspace = createTestWorkspace(),
  ports: Partial<ConstructorParameters<typeof CatReviewController>[1]> = {},
) {
  const controller = new CatReviewController(workspace, {
    intl,
    queueFilter: "all",
    usesServerQueueFilter: false,
    ...ports,
  });
  controller.start();
  return { controller, workspace };
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("CatReviewController", () => {
  it("stops selected-segment review reactions after disposal", async () => {
    const validateFormat = vi.fn().mockResolvedValue([]);
    const workspace = createTestWorkspace();
    const controller = new CatReviewController(workspace, {
      intl,
      services: { validateFormat },
      queueFilter: "all",
      usesServerQueueFilter: false,
    });
    controller.start();
    await vi.waitFor(() => expect(validateFormat).toHaveBeenCalledTimes(1));

    controller.dispose();
    workspace.setSelectedSegmentId(workspace.queueSegments[1]?.id ?? "");

    await Promise.resolve();
    expect(validateFormat).toHaveBeenCalledTimes(1);
  });

  describe("runChecks and scheduleChecks", () => {
    it("merges QA checks from runQaChecks", async () => {
      const qaCheck: CatFormatCheck = {
        id: "qa-1",
        label: "QA",
        status: "warn",
        message: "Length warning",
      };
      const runQaChecks = vi.fn().mockResolvedValue([qaCheck]);
      const { controller, workspace } = createController(undefined, {
        services: { runQaChecks },
      });
      const segment = workspace.getSegmentView("seg-02");
      expect(segment).toBeDefined();

      await controller.runChecks(segment!, "Deuxième");

      expect(workspace.segmentFormatChecks["seg-02"]).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "qa-1" })]),
      );
    });

    it("uses glossaryTermsOverride when provided", async () => {
      const validateFormat = vi.fn().mockResolvedValue([]);
      const overrideTerms: CatGlossaryTerm[] = [
        {
          id: "override-1",
          source: "Second",
          target: "Deuxième",
          approved: true,
          forbidden: false,
        },
      ];
      const { controller, workspace } = createController(undefined, {
        services: { validateFormat },
      });
      const segment = workspace.getSegmentView("seg-02");
      expect(segment).toBeDefined();

      await controller.runChecks(segment!, "Deuxième", overrideTerms);

      expect(validateFormat).toHaveBeenCalledWith(
        segment,
        "Deuxième",
        overrideTerms,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("debounces validation through scheduleChecks", async () => {
      const validateFormat = vi.fn().mockResolvedValue([]);
      const { controller, workspace } = createController(undefined, {
        services: { validateFormat },
      });
      const segment = workspace.getSegmentView("seg-02");
      expect(segment).toBeDefined();

      await vi.waitFor(() => expect(validateFormat).toHaveBeenCalledTimes(1));
      validateFormat.mockClear();

      vi.useFakeTimers();
      controller.scheduleChecks(segment!, "Deux");
      controller.scheduleChecks(segment!, "Deuxième");

      expect(validateFormat).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(300);

      expect(validateFormat).toHaveBeenCalledTimes(1);
      expect(validateFormat).toHaveBeenCalledWith(
        segment,
        "Deuxième",
        expect.any(Array),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  describe("runReview", () => {
    it("runs format checks without AI when includeAi is false", async () => {
      const validateFormat = vi.fn().mockResolvedValue([
        {
          id: "format-1",
          label: "Format",
          status: "pass",
          message: "Looks good",
        },
      ]);
      const generateAiRecommendation = vi.fn();
      const { controller, workspace } = createController(undefined, {
        services: { validateFormat, generateAiRecommendation },
      });

      await controller.runReview("seg-02", { includeAi: false });

      expect(generateAiRecommendation).not.toHaveBeenCalled();
      expect(workspace.segmentFormatChecks["seg-02"]).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "format-1" })]),
      );
    });
  });

  describe("approve", () => {
    it("advances to the next segment after a successful approve", async () => {
      const onApprove = vi.fn().mockResolvedValue("reviewed");
      const { controller, workspace } = createController(undefined, {
        review: { onApprove },
      });

      await controller.approve("seg-02", "Deuxième");

      expect(onApprove).toHaveBeenCalledWith("seg-02", "Deuxième");
      expect(workspace.selectedSegmentId).toBe("seg-03");
      expect(workspace.getSegmentView("seg-02")?.status).toBe("reviewed");
      expect(workspace.isApproving).toBe(false);
    });

    it("keeps the current selection when approving the last visible segment", async () => {
      const onApprove = vi.fn().mockResolvedValue("reviewed");
      const workspace = createTestWorkspace({ selectedSegmentId: "seg-03" });
      const controller = new CatReviewController(workspace, {
        intl,
        review: { onApprove },
        queueFilter: "all",
        usesServerQueueFilter: false,
      });
      controller.start();

      await controller.approve("seg-03", "Troisième");

      expect(workspace.selectedSegmentId).toBe("seg-03");
    });

    it("applies a custom status returned by onApprove", async () => {
      const onApprove = vi.fn().mockResolvedValue("needs_review");
      const { controller, workspace } = createController(undefined, {
        review: { onApprove },
      });

      await controller.approve("seg-02", "Deuxième");

      expect(workspace.getSegmentView("seg-02")?.status).toBe("needs_review");
    });

    it("adds save failure checks when approve fails", async () => {
      const { controller, workspace } = createController(undefined, {
        review: {
          onApprove: vi.fn().mockRejectedValue(new Error("Provider rejected the update.")),
        },
      });

      await controller.approve("seg-02", "Deuxième");

      expect(workspace.segmentFormatChecks["seg-02"]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "save-failed-seg-02",
            message: "Provider rejected the update.",
          }),
        ]),
      );
      expect(workspace.selectedSegmentId).toBe("seg-02");
    });
  });

  describe("saveDraft", () => {
    it("marks the segment saved with the returned status", async () => {
      const onSaveDraft = vi.fn().mockResolvedValue("needs_review");
      const { controller, workspace } = createController(undefined, {
        review: { onSaveDraft },
      });

      await controller.saveDraft("seg-02", "Deuxième");

      expect(onSaveDraft).toHaveBeenCalledWith("seg-02", "Deuxième");
      expect(workspace.getSegmentView("seg-02")?.targetText).toBe("Deuxième");
      expect(workspace.getSegmentView("seg-02")?.status).toBe("needs_review");
      expect(workspace.isSavingDraft).toBe(false);
    });

    it("no-ops when onSaveDraft is not provided", async () => {
      const { controller, workspace } = createController();

      await controller.saveDraft("seg-02", "Deuxième");

      expect(workspace.getSegmentView("seg-02")?.targetText).toBe("");
      expect(workspace.isSavingDraft).toBe(false);
    });

    it("adds save failure checks when saveDraft fails", async () => {
      const { controller, workspace } = createController(undefined, {
        review: {
          onSaveDraft: vi.fn().mockRejectedValue(new Error("Draft save failed.")),
        },
      });

      await controller.saveDraft("seg-02", "Deuxième");

      expect(workspace.segmentFormatChecks["seg-02"]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "save-failed-seg-02",
            message: "Draft save failed.",
          }),
        ]),
      );
    });
  });

  describe("comments", () => {
    it("posts comments successfully", async () => {
      const onAddComment = vi.fn().mockResolvedValue(undefined);
      const { controller, workspace } = createController(undefined, {
        review: { onAddComment },
      });

      await controller.addComment("seg-02", { text: "Needs context", type: "comment" });

      expect(onAddComment).toHaveBeenCalledWith("seg-02", {
        text: "Needs context",
        type: "comment",
      });
      expect(workspace.commentPostError).toBeUndefined();
      expect(workspace.isPostingComment).toBe(false);
    });

    it("stores comment post errors and rethrows", async () => {
      const { controller, workspace } = createController(undefined, {
        review: {
          onAddComment: vi.fn().mockRejectedValue(new Error("Failed to post comment.")),
        },
      });

      await expect(
        controller.addComment("seg-02", { text: "Needs context", type: "comment" }),
      ).rejects.toThrow("Failed to post comment.");

      expect(workspace.commentPostError).toBe("Failed to post comment.");
      expect(workspace.isPostingComment).toBe(false);
    });

    it("resolves comments successfully", async () => {
      const onResolveComment = vi.fn().mockResolvedValue(undefined);
      const { controller, workspace } = createController(undefined, {
        review: { onResolveComment },
      });

      await controller.resolveComment("seg-02", "comment-1");

      expect(onResolveComment).toHaveBeenCalledWith("seg-02", "comment-1");
      expect(workspace.commentPostError).toBeUndefined();
      expect(workspace.isResolvingComment).toBe(false);
      expect(workspace.resolvingCommentId).toBeNull();
    });

    it("stores resolve errors and rethrows", async () => {
      const { controller, workspace } = createController(undefined, {
        review: {
          onResolveComment: vi.fn().mockRejectedValue(new Error("Failed to resolve comment.")),
        },
      });

      await expect(controller.resolveComment("seg-02", "comment-1")).rejects.toThrow(
        "Failed to resolve comment.",
      );

      expect(workspace.commentPostError).toBe("Failed to resolve comment.");
      expect(workspace.isResolvingComment).toBe(false);
      expect(workspace.resolvingCommentId).toBeNull();
    });
  });

  describe("skip", () => {
    it("marks the segment skipped and invokes onSkip", () => {
      const onSkip = vi.fn();
      const { controller, workspace } = createController(undefined, {
        review: { onSkip },
      });

      controller.skip("seg-02");

      expect(workspace.getSegmentView("seg-02")?.status).toBe("skipped");
      expect(onSkip).toHaveBeenCalledWith("seg-02");
    });
  });

  describe("bulkApprove", () => {
    it("delegates to onBulkApprove when provided", async () => {
      const onBulkApprove = vi.fn().mockResolvedValue(undefined);
      const workspace = createTestWorkspace();
      workspace.toggleSegmentChecked("seg-02", true);
      workspace.toggleSegmentChecked("seg-03", true);
      const { controller } = createController(workspace, {
        review: { onBulkApprove },
      });

      await controller.bulkApprove();

      expect(onBulkApprove).toHaveBeenCalledWith(["seg-02", "seg-03"]);
      expect(workspace.checkedSegmentIds.size).toBe(0);
      expect(workspace.isBulkActionPending).toBe(false);
    });

    it("no-ops when no segments are checked", async () => {
      const onBulkApprove = vi.fn();
      const { controller, workspace } = createController(undefined, {
        review: { onBulkApprove },
      });

      await controller.bulkApprove();

      expect(onBulkApprove).not.toHaveBeenCalled();
      expect(workspace.isBulkActionPending).toBe(false);
    });
  });

  describe("bulkSkip", () => {
    it("delegates to onBulkSkip when provided", async () => {
      const onBulkSkip = vi.fn().mockResolvedValue(undefined);
      const workspace = createTestWorkspace();
      workspace.toggleSegmentChecked("seg-02", true);
      workspace.toggleSegmentChecked("seg-03", true);
      const { controller } = createController(workspace, {
        review: { onBulkSkip },
      });

      await controller.bulkSkip();

      expect(onBulkSkip).toHaveBeenCalledWith(["seg-02", "seg-03"]);
      expect(workspace.checkedSegmentIds.size).toBe(0);
      expect(workspace.isBulkActionPending).toBe(false);
    });

    it("falls back to skip for each checked segment", async () => {
      const onSkip = vi.fn();
      const workspace = createTestWorkspace();
      workspace.toggleSegmentChecked("seg-02", true);
      workspace.toggleSegmentChecked("seg-03", true);
      const { controller } = createController(workspace, {
        review: { onSkip },
      });

      await controller.bulkSkip();

      expect(onSkip).toHaveBeenCalledTimes(2);
      expect(workspace.getSegmentView("seg-02")?.status).toBe("skipped");
      expect(workspace.getSegmentView("seg-03")?.status).toBe("skipped");
      expect(workspace.checkedSegmentIds.size).toBe(0);
    });

    it("no-ops when no segments are checked", async () => {
      const onBulkSkip = vi.fn();
      const { controller, workspace } = createController(undefined, {
        review: { onBulkSkip },
      });

      await controller.bulkSkip();

      expect(onBulkSkip).not.toHaveBeenCalled();
      expect(workspace.isBulkActionPending).toBe(false);
    });
  });
});
