// @vitest-environment happy-dom

import { screen } from "@testing-library/react";
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

  it("hides approve actions when the focused row is clean", () => {
    renderRow({ isDirty: false });

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

  it("disables approve when the target is empty", () => {
    const state = createCatWorkspaceState({ selectedSegmentId: "seg-02" });
    const segment = {
      ...state.segments!.find((item) => item.id === "seg-02")!,
      targetText: "",
    };

    renderRow({ segment });

    expect(screen.getByRole("button", { name: /Approve/i })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: /Approve/i })).toBeDisabled();
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
