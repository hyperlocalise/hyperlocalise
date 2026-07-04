// @vitest-environment happy-dom

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { createCatWorkspaceState } from "@/components/cat/shared/cat.fixture";
import { renderWithCatProviders } from "@/components/cat/shared/cat-test-utils";
import type { CatEditorPanelProps } from "@/components/cat/editor/cat-editor-panel.types";

import { CatEditorPanel } from "./cat-editor-panel";

function renderEditorPanel(overrides: Partial<CatEditorPanelProps> = {}) {
  const state = createCatWorkspaceState({ selectedSegmentId: "seg-02" });
  const segment = state.segments.find((item) => item.id === "seg-02")!;

  const props: CatEditorPanelProps = {
    segment,
    segmentPosition: 2,
    totalSegments: state.segments.length,
    formatChecks: state.formatChecks,
    intelligence: state.intelligence,
    canApprove: true,
    canEditTranslations: true,
    canLookupContext: true,
    canUseAiRecommendation: true,
    onTargetChange: vi.fn(),
    onCopySource: vi.fn(),
    onClearTarget: vi.fn(),
    onUseAiSuggestion: vi.fn(),
    onApprove: vi.fn(),
    onAskQuestion: vi.fn(),
    onGenerateAiRecommendation: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    hasPreviousSegment: true,
    hasNextSegment: true,
    ...overrides,
  };

  return {
    props,
    ...renderWithCatProviders(<CatEditorPanel {...props} />),
  };
}

describe("CatEditorPanel UI", () => {
  it("disables approve while another action is in flight", () => {
    renderEditorPanel({ isApproving: true });

    expect(screen.getByRole("button", { name: /Approve/i })).toBeDisabled();
  });

  it("disables approve when the target string is empty", () => {
    renderEditorPanel({
      segment: {
        ...createCatWorkspaceState({ selectedSegmentId: "seg-02" }).segments.find(
          (item) => item.id === "seg-02",
        )!,
        targetText: "",
      },
    });

    expect(screen.getByRole("button", { name: /Approve/i })).toBeDisabled();
  });

  it("disables find context when lookup is unavailable", () => {
    renderEditorPanel({ canLookupContext: false });

    const findContextButtons = screen.getAllByRole("button", { name: /Find context/i });
    expect(findContextButtons.every((button) => button.hasAttribute("disabled"))).toBe(true);
  });

  it("shows save draft when draft saving is supported", async () => {
    const user = userEvent.setup();
    const onSaveDraft = vi.fn();

    renderEditorPanel({ onSaveDraft });

    await user.click(screen.getByRole("button", { name: /Save as draft/i }));
    expect(onSaveDraft).toHaveBeenCalled();
  });

  it("surfaces comment post errors in the comments section", () => {
    renderEditorPanel({
      canAddComment: true,
      providerKind: "crowdin",
      commentPostError: "Failed to post comment.",
    });

    expect(screen.getByText("Failed to post comment.")).toBeInTheDocument();
  });

  it("invokes navigation handlers from the action bar", async () => {
    const user = userEvent.setup();
    const onPrevious = vi.fn();
    const onNext = vi.fn();

    renderEditorPanel({ onPrevious, onNext });

    await user.click(screen.getByRole("button", { name: "Previous segment" }));
    await user.click(screen.getByRole("button", { name: "Next segment" }));

    expect(onPrevious).toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });

  it("blocks primary actions while context lookup is running", () => {
    renderEditorPanel({ isLookingUpContext: true });

    expect(screen.getByRole("button", { name: /Approve/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Finding context/i })).toBeDisabled();
  });

  it("renders format check failures for the active segment", () => {
    renderEditorPanel({
      formatChecks: [
        {
          id: "check-length",
          label: "Length on mobile",
          status: "fail",
          message: "Translation exceeds 80 characters.",
          category: "length",
        },
      ],
    });

    expect(screen.getByText("Length on mobile")).toBeInTheDocument();
    expect(screen.getByText("Translation exceeds 80 characters.")).toBeInTheDocument();
  });

  it("shows the segment key above the source heading", () => {
    renderEditorPanel();

    expect(screen.getByText("dashboard.reviews.pending.card")).toBeInTheDocument();
  });
});
