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

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorQueueToolbar } from "./content-editor-queue-toolbar";

describe("ContentEditorQueueToolbar", () => {
  it("includes Hidden in the Crowdin queue filter menu", async () => {
    const user = userEvent.setup();
    const onQueueFilterChange = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        queueFilter="all"
        onQueueFilterChange={onQueueFilterChange}
        availableQueueFilters={["all", "hidden"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filter queue" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Hidden" }));

    expect(onQueueFilterChange).toHaveBeenCalledWith("hidden");
  });

  it("shows Crowdin extra filters and the sort menu", async () => {
    const user = userEvent.setup();
    const onQueueFilterChange = vi.fn();
    const onQueueSortChange = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        queueFilter="all"
        onQueueFilterChange={onQueueFilterChange}
        availableQueueFilters={[
          "all",
          "unsaved",
          "qa_issues",
          "machine_translated",
          "with_comments",
        ]}
        queueSort="file_order"
        onQueueSortChange={onQueueSortChange}
        availableQueueSorts={["file_order", "untranslated_first"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filter queue" }));
    expect(screen.getByRole("menuitemradio", { name: "Unsaved translations" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "QA issues" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Machine translations" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "With comments" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sort queue" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Untranslated first" }));

    expect(onQueueSortChange).toHaveBeenCalledWith("untranslated_first");
  });

  it("hides sort when untranslated first is not available", () => {
    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        queueFilter="all"
        onQueueFilterChange={vi.fn()}
        availableQueueFilters={["all"]}
        queueSort="file_order"
        onQueueSortChange={vi.fn()}
        availableQueueSorts={["file_order"]}
      />,
    );

    expect(screen.queryByRole("button", { name: "Sort queue" })).not.toBeInTheDocument();
  });

  it("offers Hide and Unhide when those bulk handlers are provided", async () => {
    const user = userEvent.setup();
    const onBulkHide = vi.fn();
    const onBulkUnhide = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        selectionMode
        onSelectionModeChange={vi.fn()}
        onBulkHide={onBulkHide}
        onBulkUnhide={onBulkUnhide}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Queue actions" }));

    expect(screen.getByRole("menuitem", { name: "Hide selected" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "Unhide selected" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("offers Lock and Unlock when those bulk handlers are provided", async () => {
    const user = userEvent.setup();
    const onBulkLock = vi.fn();
    const onBulkUnlock = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        selectionMode
        onSelectionModeChange={vi.fn()}
        onBulkLock={onBulkLock}
        onBulkUnlock={onBulkUnlock}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Queue actions" }));

    expect(screen.getByRole("menuitem", { name: "Lock selected" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "Unlock selected" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("disables select-all and bulk mutate while the queue is still loading placeholder data", async () => {
    const user = userEvent.setup();
    const onSelectAllVisible = vi.fn();
    const onBulkHide = vi.fn();
    const onBulkApprove = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        selectionMode
        onSelectionModeChange={vi.fn()}
        visibleCount={12}
        selectedCount={3}
        isQueueLoading
        onSelectAllVisible={onSelectAllVisible}
        onBulkHide={onBulkHide}
        onBulkApprove={onBulkApprove}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Queue actions" }));

    const selectAll = screen.getByRole("menuitem", { name: "Select all visible" });
    const hideSelected = screen.getByRole("menuitem", { name: "Hide selected" });
    const approveSelected = screen.getByRole("menuitem", { name: "Approve selected" });

    expect(selectAll).toHaveAttribute("aria-disabled", "true");
    expect(hideSelected).toHaveAttribute("aria-disabled", "true");
    expect(approveSelected).toHaveAttribute("aria-disabled", "true");

    await user.click(selectAll);
    await user.click(hideSelected);
    await user.click(approveSelected);

    expect(onSelectAllVisible).not.toHaveBeenCalled();
    expect(onBulkHide).not.toHaveBeenCalled();
    expect(onBulkApprove).not.toHaveBeenCalled();
  });
});
