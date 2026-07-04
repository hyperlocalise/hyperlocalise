// @vitest-environment happy-dom

import type { ReactElement } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  catSegmentsFixture,
  createCatWorkspaceState,
  mockValidateFormat,
} from "@/components/cat/shared/cat.fixture";
import { renderWithCatProviders } from "@/components/cat/shared/cat-test-utils";

import { CatWorkspaceContainer } from "./cat-workspace-container";

async function waitForTargetEditor() {
  return waitFor(() =>
    document.querySelector('[aria-label="Target translation"][contenteditable="true"]'),
  );
}

function createUiCatWorkspaceState() {
  return createCatWorkspaceState({
    selectedSegmentId: "seg-02",
    segments: catSegmentsFixture.filter((segment) =>
      ["seg-01", "seg-02", "seg-03"].includes(segment.id),
    ),
  });
}

function renderCatWorkspace(ui: ReactElement) {
  return renderWithCatProviders(
    <div style={{ height: "900px", width: "1280px" }} className="bg-background text-foreground">
      {ui}
    </div>,
  );
}

describe("CatWorkspaceContainer UI", () => {
  it("renders queue, editor, and intelligence panels on desktop", async () => {
    renderCatWorkspace(
      <CatWorkspaceContainer
        initialState={createUiCatWorkspaceState()}
        services={{ validateFormat: mockValidateFormat }}
      />,
    );

    expect(screen.getByText("Queue")).toBeInTheDocument();
    expect(screen.getByText("Translation Intelligence")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Approve/i })).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Dashboard card showing how many reviews still need approval."),
    ).toBeInTheDocument();
  });

  it("shows an empty queue state when there are no segments", () => {
    renderCatWorkspace(
      <CatWorkspaceContainer
        initialState={createCatWorkspaceState({ segments: [], selectedSegmentId: "" })}
      />,
    );

    expect(screen.getByText("No segments in queue.")).toBeInTheDocument();
  });

  it("calls approve after editing the target translation", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue("reviewed");

    renderCatWorkspace(
      <CatWorkspaceContainer
        initialState={createUiCatWorkspaceState()}
        review={{ onApprove }}
        services={{ validateFormat: mockValidateFormat }}
      />,
    );

    const targetEditor = (await waitForTargetEditor()) as HTMLElement;
    await user.click(targetEditor);
    await user.keyboard("{Control>}a{/Control}Updated translation");
    await user.click(screen.getByRole("button", { name: /Approve/i }));

    await waitFor(() => expect(onApprove).toHaveBeenCalledWith("seg-02", "Updated translation"));
  });

  it("applies AI suggestions from the editor recommendation panel", async () => {
    const user = userEvent.setup();
    const onUseAiSuggestion = vi.fn();

    renderCatWorkspace(
      <CatWorkspaceContainer
        initialState={createUiCatWorkspaceState()}
        editing={{ onUseAiSuggestion }}
        services={{
          validateFormat: mockValidateFormat,
          generateAiRecommendation: async () => ({
            aiSuggestion: "Thẻ trên bảng điều khiển hiển thị số lượng đánh giá cần phê duyệt.",
          }),
        }}
      />,
    );

    const aiPanel = screen.getByText("AI recommendation").closest("aside");
    expect(aiPanel).toBeTruthy();

    await user.click(within(aiPanel as HTMLElement).getByRole("button", { name: "Use" }));

    expect(onUseAiSuggestion).toHaveBeenCalledWith("seg-02");
  });

  it("uses compact tabs on narrow viewports", async () => {
    const user = userEvent.setup();
    const originalMatchMedia = window.matchMedia;
    const matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    window.matchMedia = matchMedia;

    try {
      renderCatWorkspace(
        <CatWorkspaceContainer
          initialState={createUiCatWorkspaceState()}
          services={{ validateFormat: mockValidateFormat }}
        />,
      );

      await waitFor(() => expect(screen.getByRole("tab", { name: "Edit" })).toBeInTheDocument());
      expect(screen.getByRole("tab", { name: "Queue" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "AI" })).toBeInTheDocument();

      await user.click(screen.getByRole("tab", { name: "Queue" }));
      expect(screen.getByRole("tab", { name: "Queue" })).toHaveAttribute("data-active");
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
