// @vitest-environment happy-dom

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { createCatWorkspaceState } from "@/components/cat/shared/cat.fixture";
import { renderWithCatProviders } from "@/components/cat/shared/cat-test-utils";

import { CatSideBySideRow } from "./cat-side-by-side-row";

function renderRow(overrides: Partial<Parameters<typeof CatSideBySideRow>[0]> = {}) {
  const state = createCatWorkspaceState({ selectedSegmentId: "seg-02" });
  const segment = state.segments!.find((item) => item.id === "seg-02")!;

  const props: Parameters<typeof CatSideBySideRow>[0] = {
    segment,
    isFocused: true,
    isHovered: false,
    isDirty: true,
    canEdit: true,
    isTargetLoading: false,
    onFocus: vi.fn(),
    onHover: vi.fn(),
    onLeave: vi.fn(),
    onTargetChange: vi.fn(),
    onApprove: vi.fn(),
    onSaveDraft: vi.fn(),
    ...overrides,
  };

  return {
    props,
    ...renderWithCatProviders(<CatSideBySideRow {...props} />),
  };
}

describe("CatSideBySideRow", () => {
  it("shows approve and save draft when the focused row is dirty", () => {
    renderRow();

    expect(screen.getByRole("button", { name: /Approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save as draft/i })).toBeInTheDocument();
  });

  it("uses the provider primary action label when provided", () => {
    renderRow({ primaryActionLabel: "Save to provider" });

    expect(screen.getByRole("button", { name: /Save to provider/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Approve$/i })).not.toBeInTheDocument();
  });

  it("shows status badge and segment tags in the row chrome", () => {
    renderRow({ isDirty: false });

    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(screen.getByText("card")).toBeInTheDocument();
    expect(screen.getByText("high impact")).toBeInTheDocument();
  });

  it("hides the status badge while the target is loading", () => {
    const state = createCatWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      status: "pending" as const,
      targetText: "",
    };

    renderRow({ segment, isDirty: false, isTargetLoading: true });

    expect(screen.queryByText("Untranslated")).not.toBeInTheDocument();
    expect(screen.queryByText("Needs review")).not.toBeInTheDocument();
  });

  it("shows the share link button when focused with a share url", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderRow({ segmentShareUrl: "https://example.com/segments/seg-02" });

    const shareButton = screen.getByRole("button", { name: /Copy link to this segment/i });
    expect(shareButton).toBeInTheDocument();

    await user.click(shareButton);
    expect(writeText).toHaveBeenCalledWith("https://example.com/segments/seg-02");
  });

  it("hides the share link button when the row is not focused", () => {
    renderRow({
      isFocused: false,
      segmentShareUrl: "https://example.com/segments/seg-02",
    });

    expect(
      screen.queryByRole("button", { name: /Copy link to this segment/i }),
    ).not.toBeInTheDocument();
  });

  it("shows approve actions when the focused row has a target and is clean", () => {
    renderRow({ isDirty: false });

    expect(screen.getByRole("button", { name: /Approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save as draft/i })).toBeInTheDocument();
  });

  it("hides approve actions when the focused row has no target text", () => {
    const state = createCatWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      status: "pending" as const,
      targetText: "",
    };

    renderRow({ segment, isDirty: false });

    expect(screen.queryByRole("button", { name: /Approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save as draft/i })).not.toBeInTheDocument();
  });

  it("hides approve actions when the row is not focused", () => {
    renderRow({ isFocused: false });

    expect(screen.queryByRole("button", { name: /Approve/i })).not.toBeInTheDocument();
  });

  it("calls onApprove when Approve is clicked", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();

    renderRow({ onApprove });

    await user.click(screen.getByRole("button", { name: /Approve/i }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("approves with Ctrl+Enter while the target editor is focused", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();

    renderRow({ onApprove });

    const targetEditor = await waitFor(() => {
      const editor = document.querySelector(
        '[aria-label="Target translation"][contenteditable="true"]',
      );
      expect(editor).toBeTruthy();
      return editor as HTMLElement;
    });
    await user.click(targetEditor);
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("calls onSaveDraft when Save as draft is clicked", async () => {
    const user = userEvent.setup();
    const onSaveDraft = vi.fn();

    renderRow({ onSaveDraft });

    await user.click(screen.getByRole("button", { name: /Save as draft/i }));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
  });

  it("omits save draft when onSaveDraft is not provided", () => {
    renderRow({ onSaveDraft: undefined });

    expect(screen.getByRole("button", { name: /Approve/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save as draft/i })).not.toBeInTheDocument();
  });

  it("hides approve when the target is empty even if the row is dirty", () => {
    const state = createCatWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      targetText: "",
    };

    renderRow({ segment, isDirty: true });

    expect(screen.queryByRole("button", { name: /Approve/i })).not.toBeInTheDocument();
  });

  it("shows copy source and clear for focused text rows", async () => {
    const user = userEvent.setup();
    const onTargetChange = vi.fn();
    const state = createCatWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = state.segments!.find((item) => item.id === "seg-02")!;

    renderRow({ segment, onTargetChange });

    expect(screen.getByRole("button", { name: /Copy source/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clear target/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Copy source/i }));
    expect(onTargetChange).toHaveBeenCalledWith(segment.sourceText);

    await user.click(screen.getByRole("button", { name: /Clear target/i }));
    expect(onTargetChange).toHaveBeenCalledWith("");
  });

  it("keeps copy source and clear visible when a text row is not focused", () => {
    renderRow({ isFocused: false });

    expect(screen.getByRole("button", { name: /Copy source/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clear target/i })).toBeInTheDocument();
  });

  it("shows treat as image for image-url rows even when not focused", () => {
    const state = createCatWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      contentKind: "image_url" as const,
      sourceText: "https://placehold.co/640x360/png",
      sourceAssetUrl: "https://placehold.co/640x360/png",
      targetText: "",
    };

    renderRow({
      isFocused: false,
      segment,
      onTreatAsImage: vi.fn(),
    });

    expect(
      screen.getByRole("button", { name: /Treat as image|Treat as text/i }),
    ).toBeInTheDocument();
  });

  it("shows AI recommendation when enabled for focused text rows", async () => {
    const user = userEvent.setup();
    const onUseAiSuggestion = vi.fn();
    const onGenerateAiRecommendation = vi.fn();
    const state = createCatWorkspaceState({ selectedSegmentId: "seg-02" });
    const intelligence = state.intelligence!;

    renderRow({
      canUseAiRecommendation: true,
      intelligence,
      onUseAiSuggestion,
      onGenerateAiRecommendation,
    });

    expect(screen.getByText(/AI recommendation/i)).toBeInTheDocument();
    expect(screen.getByText(intelligence.aiSuggestion!)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Use$/i }));
    expect(onUseAiSuggestion).toHaveBeenCalledTimes(1);
  });

  it("hides AI recommendation when not focused", () => {
    const state = createCatWorkspaceState({ selectedSegmentId: "seg-02" });

    renderRow({
      isFocused: false,
      canUseAiRecommendation: true,
      intelligence: state.intelligence!,
      onUseAiSuggestion: vi.fn(),
    });

    expect(screen.getByRole("button", { name: /Copy source/i })).toBeInTheDocument();
    expect(screen.queryByText(/AI recommendation/i)).not.toBeInTheDocument();
  });

  it("shows character count for focused text rows", () => {
    const state = createCatWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      maxLength: 80,
      targetText: "Hello",
    };

    renderRow({ segment });

    expect(screen.getByText("5/80 characters")).toBeInTheDocument();
  });

  it("shows a loading icon while format checks are loading", () => {
    renderRow({ isFormatChecksLoading: true, formatChecks: [] });

    expect(screen.getByRole("status", { name: /Checking format & QA/i })).toBeInTheDocument();
  });

  it("shows a format check warning icon and details for focused text rows", () => {
    renderRow({
      formatChecks: [
        {
          id: "check-placeholders",
          label: "Placeholders & markup",
          status: "pass",
          message: "No placeholders required.",
          category: "placeholder",
        },
        {
          id: "check-terminology",
          label: "Terminology consistency",
          status: "warn",
          message: "Ambiguous noun: review",
          category: "terminology",
        },
      ],
    });

    const icon = screen.getByRole("img", { name: /Format & QA warning/i });
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("data-status", "warn");
    expect(screen.getByText("Terminology consistency")).toBeInTheDocument();
    expect(screen.getByText("Ambiguous noun: review")).toBeInTheDocument();
    expect(screen.queryByText("Placeholders & markup")).not.toBeInTheDocument();
    expect(screen.queryByText(/Format & QA checks/i)).not.toBeInTheDocument();
  });

  it("shows a format check icon without details on inactive text rows", () => {
    renderRow({
      isFocused: false,
      isHovered: false,
      formatChecks: [
        {
          id: "check-terminology",
          label: "Terminology consistency",
          status: "fail",
          message: "Ambiguous noun: review",
          category: "terminology",
        },
      ],
    });

    const icon = screen.getByRole("img", { name: /Format & QA failed/i });
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("data-status", "fail");
    expect(screen.queryByText("Terminology consistency")).not.toBeInTheDocument();
  });

  it("reveals format check details when an inactive row is hovered", async () => {
    renderRow({
      isFocused: false,
      isHovered: true,
      formatChecks: [
        {
          id: "check-terminology",
          label: "Terminology consistency",
          status: "warn",
          message: "Ambiguous noun: review",
          category: "terminology",
        },
      ],
    });

    expect(screen.getByRole("img", { name: /Format & QA warning/i })).toBeInTheDocument();
    expect(await screen.findByText("Terminology consistency")).toBeInTheDocument();
  });

  it("prefers the loading icon over a stale format check result", () => {
    renderRow({
      isFormatChecksLoading: true,
      formatChecks: [
        {
          id: "check-terminology",
          label: "Terminology consistency",
          status: "warn",
          message: "Ambiguous noun: review",
          category: "terminology",
        },
      ],
    });

    expect(screen.getByRole("status", { name: /Checking format & QA/i })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Format & QA warning/i })).not.toBeInTheDocument();
  });

  it("hides format check icons when there are no issues", () => {
    renderRow({ formatChecks: [] });

    expect(screen.queryByRole("img", { name: /Format & QA/i })).not.toBeInTheDocument();
  });

  it("hides format check icons when every check passed", () => {
    renderRow({
      formatChecks: [
        {
          id: "check-placeholders",
          label: "Placeholders & markup",
          status: "pass",
          message: "No placeholders required.",
          category: "placeholder",
        },
      ],
    });

    expect(screen.queryByRole("img", { name: /Format & QA/i })).not.toBeInTheDocument();
  });

  it("hides ICU structure summary when the source has no ICU blocks", () => {
    renderRow();

    expect(screen.queryByText(/ICU structure/i)).not.toBeInTheDocument();
  });

  it("shows required tokens and ICU structure for focused ICU rows", () => {
    const state = createCatWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      sourceText: "Hello {name}, you have {count, plural, one {# review} other {# reviews}}.",
      targetText: "Xin chào {name}.",
    };

    renderRow({ segment });

    expect(screen.getByText(/Required tokens/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "{name}" })).toBeInTheDocument();
    expect(screen.getByText(/ICU structure/i)).toBeInTheDocument();
  });

  it("shows add to issue sheet when provided for focused text rows", async () => {
    const user = userEvent.setup();
    const onAddToIssueSheet = vi.fn();

    renderRow({ isDirty: false, onAddToIssueSheet });

    expect(screen.getByRole("button", { name: /Approve/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Add to issue sheet/i }));
    expect(onAddToIssueSheet).toHaveBeenCalledTimes(1);
  });

  it("renders image upload controls for image segments", () => {
    const state = createCatWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      contentKind: "image_url" as const,
      sourceText: "https://example.com/source.png",
      sourceAssetUrl: "https://example.com/source.png",
      targetText: "",
      targetAssetUrl: undefined,
    };

    renderRow({
      segment,
      isDirty: false,
      onUploadImage: vi.fn(),
      onTreatAsImage: vi.fn(),
    });

    expect(screen.getByText(/Upload/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save as draft/i })).not.toBeInTheDocument();
  });

  it("enables approve for image segments with a target asset", () => {
    const state = createCatWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      contentKind: "image_file" as const,
      sourceAssetUrl: "https://example.com/source.png",
      targetAssetUrl: "https://example.com/target.png",
      targetText: "",
    };

    renderRow({ segment, isDirty: false, onUploadImage: vi.fn() });

    expect(screen.getByRole("button", { name: /Approve/i })).toBeEnabled();
  });

  it.each([
    { isApproving: true },
    { isSavingDraft: true },
    { isPostingComment: true },
    { isLookingUpContext: true },
    { isAiSuggestionLoading: true },
    { isFormatChecksLoading: true },
    { isTargetLoading: true },
    { isImageBusy: true },
  ] as const)("disables approve during busy state %j", (busyState) => {
    renderRow(busyState);

    expect(screen.getByRole("button", { name: /Approve/i })).toBeDisabled();
  });
});
