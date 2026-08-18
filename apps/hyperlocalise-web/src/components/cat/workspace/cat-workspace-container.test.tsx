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

  it("starts in comfortable view when initialViewMode is comfortable", async () => {
    window.localStorage.setItem("cat-workspace-view-mode:v1", "side-by-side");

    try {
      renderCatWorkspace(
        <CatWorkspaceContainer
          initialState={createUiCatWorkspaceState()}
          initialViewMode="comfortable"
          services={{ validateFormat: mockValidateFormat }}
        />,
      );

      const viewModeButton = await waitFor(() =>
        screen.getByRole("button", { name: "CAT view mode" }),
      );
      expect(viewModeButton).toHaveTextContent("Comfortable");
      expect(screen.getByText("Translation Intelligence")).toBeInTheDocument();
      expect(screen.queryByText("Source")).not.toBeInTheDocument();
    } finally {
      window.localStorage.removeItem("cat-workspace-view-mode:v1");
    }
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

  it("approves with Ctrl+Enter while typing in the comfortable target editor", async () => {
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
    await user.keyboard("{Control>}a{/Control}Saved via shortcut");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Approve/i })).not.toBeDisabled(),
    );
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(onApprove).toHaveBeenCalledWith("seg-02", "Saved via shortcut"));
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

  it("selects the ingested queue after a cached snapshot swap, not the previous page", async () => {
    const user = userEvent.setup();
    const initialState = createUiCatWorkspaceState();
    const filteredState = createCatWorkspaceState({
      selectedSegmentId: "seg-01",
      segments: catSegmentsFixture.filter((segment) => segment.id === "seg-01"),
    });

    const view = renderCatWorkspace(
      <CatWorkspaceContainer
        initialState={initialState}
        review={{
          onApprove: vi.fn(),
          onBulkHide: vi.fn(),
        }}
        services={{ validateFormat: mockValidateFormat }}
      />,
    );

    await user.click(
      await screen.findByRole("checkbox", { name: "Show bulk selection checkboxes" }),
    );

    view.rerender(
      <div style={{ height: "900px", width: "1280px" }} className="bg-background text-foreground">
        <CatWorkspaceContainer
          initialState={initialState}
          queueSnapshot={filteredState}
          isQueueLoading={false}
          review={{
            onApprove: vi.fn(),
            onBulkHide: vi.fn(),
          }}
          services={{ validateFormat: mockValidateFormat }}
        />
      </div>,
    );

    await waitFor(() => {
      expect(
        screen.queryAllByText("Dashboard card showing how many reviews still need approval."),
      ).toHaveLength(0);
    });

    view.rerender(
      <div style={{ height: "900px", width: "1280px" }} className="bg-background text-foreground">
        <CatWorkspaceContainer
          initialState={initialState}
          queueSnapshot={initialState}
          isQueueLoading={false}
          review={{
            onApprove: vi.fn(),
            onBulkHide: vi.fn(),
          }}
          services={{ validateFormat: mockValidateFormat }}
        />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Queue actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Select all visible" }));

    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });

  it("keeps select-all and bulk mutate disabled while the query is still loading", async () => {
    const user = userEvent.setup();
    const onBulkHide = vi.fn();
    const onApprove = vi.fn();

    renderCatWorkspace(
      <CatWorkspaceContainer
        initialState={createUiCatWorkspaceState()}
        isQueueLoading
        review={{
          onApprove,
          onBulkHide,
        }}
        services={{ validateFormat: mockValidateFormat }}
      />,
    );

    await user.click(
      await screen.findByRole("checkbox", { name: "Show bulk selection checkboxes" }),
    );
    await user.click(screen.getByRole("button", { name: "Queue actions" }));

    const selectAll = screen.getByRole("menuitem", { name: "Select all visible" });
    const hideSelected = screen.getByRole("menuitem", { name: "Hide selected" });

    expect(selectAll).toHaveAttribute("aria-disabled", "true");
    expect(hideSelected).toHaveAttribute("aria-disabled", "true");

    await user.click(selectAll);
    await user.click(hideSelected);

    expect(onBulkHide).not.toHaveBeenCalled();
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
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
