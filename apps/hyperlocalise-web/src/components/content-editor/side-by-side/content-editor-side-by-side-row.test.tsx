/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
// @vitest-environment happy-dom

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { createContentEditorWorkspaceState } from "@/components/content-editor/shared/content-editor.fixture";
import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { ContentEditorWorkspaceContext } from "@/components/content-editor/workspace/content-editor-workspace-context";
import { createCatWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-orchestrator";

import { ContentEditorSideBySideRow } from "./content-editor-side-by-side-row";

function renderRow(overrides: Partial<Parameters<typeof ContentEditorSideBySideRow>[0]> = {}) {
  const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
  const workspace = createCatWorkspace(state);
  const segment = state.segments!.find((item) => item.id === "seg-02")!;

  const props: Parameters<typeof ContentEditorSideBySideRow>[0] = {
    segment,
    isFocused: true,
    isHovered: false,
    isDirty: true,
    canEdit: true,
    isTargetLoading: false,
    onFocus: vi.fn(),
    onTargetChange: vi.fn(),
    onApprove: vi.fn(),
    onSaveDraft: vi.fn(),
    ...overrides,
  };

  return {
    props,
    workspace,
    ...renderWithContentEditorProviders(
      <ContentEditorWorkspaceContext.Provider value={workspace}>
        <ContentEditorSideBySideRow {...props} />
      </ContentEditorWorkspaceContext.Provider>,
    ),
  };
}

describe("ContentEditorSideBySideRow", () => {
  it("shows approve and save draft when the focused row is dirty", () => {
    renderRow();

    expect(screen.getByRole("button", { name: /Approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Draft/i })).toBeInTheDocument();
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
    const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      status: "pending" as const,
      targetText: "",
    };

    renderRow({ segment, isDirty: false, isTargetLoading: true });

    expect(screen.queryByText("Untranslated")).not.toBeInTheDocument();
    expect(screen.queryByText("Needs review")).not.toBeInTheDocument();
  });

  it("shows Hidden instead of Untranslated for hidden pending segments", () => {
    const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      status: "pending" as const,
      targetText: "",
      isHidden: true,
    };

    renderRow({ segment, isDirty: false });

    expect(screen.getByText("Hidden")).toBeInTheDocument();
    expect(screen.queryByText("Untranslated")).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /Draft/i })).toBeInTheDocument();
  });

  it("hides approve actions when the focused row has no target text", () => {
    const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      status: "pending" as const,
      targetText: "",
    };

    renderRow({ segment, isDirty: false });

    expect(screen.queryByRole("button", { name: /Approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Draft/i })).not.toBeInTheDocument();
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

  it("calls onSaveDraft when Draft is clicked", async () => {
    const user = userEvent.setup();
    const onSaveDraft = vi.fn();

    renderRow({ onSaveDraft });

    await user.click(screen.getByRole("button", { name: /Draft/i }));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
  });

  it("omits save draft when onSaveDraft is not provided", () => {
    renderRow({ onSaveDraft: undefined });

    expect(screen.getByRole("button", { name: /Approve/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Draft/i })).not.toBeInTheDocument();
  });

  it("hides approve when the target is empty even if the row is dirty", () => {
    const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      targetText: "",
    };

    renderRow({ segment, isDirty: true });

    expect(screen.queryByRole("button", { name: /Approve/i })).not.toBeInTheDocument();
  });

  it.each([
    { isPostingComment: true },
    { isLookingUpContext: true },
    { isAiSuggestionLoading: true },
    { isFormatChecksLoading: true },
  ])("allows saving while advisory work runs %j", (pending) => {
    renderRow(pending);
    expect(screen.getByRole("button", { name: /Approve/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Draft/i })).not.toBeDisabled();
  });

  it("shows copy source and clear for focused text rows", async () => {
    const user = userEvent.setup();
    const onTargetChange = vi.fn();
    const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
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
    const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
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

  it("keeps AI suggestion collapsed until the reviewer requests it", async () => {
    const user = userEvent.setup();
    const onUseAiSuggestion = vi.fn();
    const onGenerateAiRecommendation = vi.fn();
    const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
    const intelligence = state.intelligence!;

    renderRow({
      canUseAiRecommendation: true,
      intelligence,
      onUseAiSuggestion,
      onGenerateAiRecommendation,
    });

    expect(screen.getByRole("button", { name: /Generate AI suggestion/i })).toBeInTheDocument();
    expect(screen.queryByText(intelligence.aiSuggestion!)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Generate AI suggestion/i }));
    expect(onGenerateAiRecommendation).not.toHaveBeenCalled();
    expect(screen.getByText(intelligence.aiSuggestion!)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Use$/i }));
    expect(onUseAiSuggestion).toHaveBeenCalledTimes(1);
  });

  it("hides the AI suggestion action when not focused", () => {
    const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });

    renderRow({
      isFocused: false,
      canUseAiRecommendation: true,
      intelligence: state.intelligence!,
      onUseAiSuggestion: vi.fn(),
      onGenerateAiRecommendation: vi.fn(),
    });

    expect(screen.getByRole("button", { name: /Copy source/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Generate AI suggestion/i }),
    ).not.toBeInTheDocument();
  });

  it("shows character count for focused text rows", () => {
    const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      maxLength: 80,
      targetText: "Hello",
    };

    renderRow({ segment });

    expect(screen.getByText("5/80 characters")).toBeInTheDocument();
  });

  it("shows a loading status while format checks are loading", () => {
    renderRow({ isFormatChecksLoading: true, formatChecks: [] });

    expect(screen.getByRole("status", { name: /Checking format & QA/i })).toBeInTheDocument();
  });

  it("shows the first spelling issue inline on focused text rows", async () => {
    const onTargetChange = vi.fn();

    renderRow({
      onTargetChange,
      segment: {
        ...createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" }).segments!.find(
          (item) => item.id === "seg-02",
        )!,
        targetText: "Drive the product",
      },
      formatChecks: [
        {
          id: "format-parity",
          label: "Placeholders & markup",
          status: "pass",
          message: "No placeholders required.",
          category: "placeholder",
        },
        {
          id: "spelling",
          label: "Spelling",
          status: "warn",
          message: '"Drive" may be misspelled. Suggestions: Diverse.',
          category: "spelling",
          relatedTokens: ["Drive", "Diverse"],
        },
      ],
    });

    expect(screen.getByText(/Spelling:/)).toBeInTheDocument();
    expect(screen.getByText(/"Drive" may be misspelled/)).toBeInTheDocument();
    expect(screen.getByText(/Suggested: “Diverse”/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Format & QA warning/i })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: /^Fix$/i }));
    expect(onTargetChange).toHaveBeenCalledWith("Diverse the product");
  });

  it("does not offer Fix when related tokens are a placeholder list", () => {
    renderRow({
      segment: {
        ...createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" }).segments!.find(
          (item) => item.id === "seg-02",
        )!,
        targetText: "Hello {name} {count}",
      },
      formatChecks: [
        {
          id: "scan-placeholder-mismatch",
          label: "Placeholders",
          status: "fail",
          message: "Target is missing placeholders ({name}).",
          category: "placeholder",
          relatedTokens: ["{name}", "{count}"],
        },
      ],
    });

    expect(screen.getByText(/Placeholders:/)).toBeInTheDocument();
    expect(screen.queryByText(/Suggested:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Fix$/i })).not.toBeInTheDocument();
  });

  it("shows the first issue and a count for additional QA issues", async () => {
    const { workspace } = renderRow({
      formatChecks: [
        {
          id: "spelling",
          label: "Spelling",
          status: "warn",
          message: '"Drive" may be misspelled.',
          category: "spelling",
          relatedTokens: ["Drive"],
        },
        {
          id: "check-terminology",
          label: "Terminology consistency",
          status: "warn",
          message: "Ambiguous noun: review",
          category: "terminology",
        },
        {
          id: "length",
          label: "Length",
          status: "fail",
          message: "Too long",
          category: "length",
        },
      ],
    });

    expect(screen.getByText(/Spelling:/)).toBeInTheDocument();
    expect(screen.queryByText("Terminology consistency")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /\+2 more/i }));
    expect(workspace.ui.qaDetailsRevealNonce).toBe(1);
  });

  it("shows a QA count on collapsed rows without the issue text", () => {
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

    const status = screen.getByRole("button", { name: /Format & QA failed/i });
    expect(status).toHaveAttribute("data-status", "fail");
    expect(status).toHaveTextContent("1");
    expect(screen.queryByText("Terminology consistency")).not.toBeInTheDocument();
  });

  it("shows a clear QA mark on collapsed rows when every check passed", () => {
    renderRow({
      isFocused: false,
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

    expect(screen.getByRole("button", { name: /No QA issues/i })).toBeInTheDocument();
  });

  it("keeps hovered rows compact and does not reveal QA details", () => {
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

    expect(screen.getByRole("button", { name: /Format & QA warning/i })).toHaveTextContent("1");
    expect(screen.queryByText("Terminology consistency")).not.toBeInTheDocument();
  });

  it("prefers the loading status over a stale format check result on collapsed rows", () => {
    renderRow({
      isFocused: false,
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
    expect(screen.queryByRole("button", { name: /Format & QA warning/i })).not.toBeInTheDocument();
  });

  it("hides QA status when there are no checks", () => {
    renderRow({ isFocused: false, formatChecks: [] });

    expect(screen.queryByRole("button", { name: /Format & QA/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /No QA issues/i })).not.toBeInTheDocument();
  });

  it("hides inline QA when every check passed on a focused row", () => {
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

    expect(screen.queryByText("Placeholders & markup")).not.toBeInTheDocument();
  });

  it("hides ICU structure summary when the source has no ICU blocks", () => {
    renderRow();

    expect(screen.queryByText(/ICU structure/i)).not.toBeInTheDocument();
  });

  it("shows required tokens and ICU structure for focused ICU rows", () => {
    const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
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

  it("shows issues action when provided for focused text rows", async () => {
    const user = userEvent.setup();
    const onAddToIssueSheet = vi.fn();

    renderRow({ isDirty: false, onAddToIssueSheet });

    expect(screen.getByRole("button", { name: /Approve/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Query$/i }));
    expect(onAddToIssueSheet).toHaveBeenCalledTimes(1);
  });

  it("renders image upload controls for image segments", () => {
    const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
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
    expect(screen.queryByRole("button", { name: /Draft/i })).not.toBeInTheDocument();
  });

  it("enables approve for image segments with a target asset", () => {
    const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
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

  it("shows treat as video for video-url rows even when not focused", () => {
    const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      contentKind: "video_url" as const,
      sourceText: "https://cdn.example.com/clip.mp4",
      sourceAssetUrl: "https://cdn.example.com/clip.mp4",
      targetText: "",
    };

    renderRow({
      isFocused: false,
      segment,
      onTreatAsVideo: vi.fn(),
    });

    expect(
      screen.getByRole("button", { name: /Treat as video|Treat as text/i }),
    ).toBeInTheDocument();
  });

  it("renders video upload controls for video segments", () => {
    const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      contentKind: "video_url" as const,
      sourceText: "https://example.com/source.mp4",
      sourceAssetUrl: "https://example.com/source.mp4",
      targetText: "",
      targetAssetUrl: undefined,
    };

    renderRow({
      segment,
      isDirty: false,
      onUploadImage: vi.fn(),
      onTreatAsVideo: vi.fn(),
    });

    expect(screen.getByText(/Upload/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Draft/i })).not.toBeInTheDocument();
  });

  it("enables approve for video segments with a target asset", () => {
    const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      contentKind: "video_file" as const,
      sourceAssetUrl: "https://example.com/source.mp4",
      targetAssetUrl: "https://example.com/target.mp4",
      targetText: "",
    };

    renderRow({ segment, isDirty: false, onUploadImage: vi.fn() });

    expect(screen.getByRole("button", { name: /Approve/i })).toBeEnabled();
  });

  it.each([
    { isApproving: true },
    { isSavingDraft: true },
    { isTargetLoading: true },
    { isImageBusy: true },
  ] as const)("disables approve during busy state %j", (busyState) => {
    renderRow(busyState);

    expect(screen.getByRole("button", { name: /Approve/i })).toBeDisabled();
  });
});
