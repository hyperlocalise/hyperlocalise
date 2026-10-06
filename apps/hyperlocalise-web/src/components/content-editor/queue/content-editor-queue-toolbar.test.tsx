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
        availableQueueFilters={["all", "hidden", "not_hidden"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filter queue" }));
    await user.click(screen.getByRole("menuitem", { name: "Hidden" }));

    expect(onQueueFilterChange).toHaveBeenCalledWith("hidden");
  });

  it("includes Not hidden in the Crowdin queue filter menu", async () => {
    const user = userEvent.setup();
    const onQueueFilterChange = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        queueFilter="all"
        onQueueFilterChange={onQueueFilterChange}
        availableQueueFilters={["all", "hidden", "not_hidden"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filter queue" }));
    await user.click(screen.getByRole("menuitem", { name: "Not hidden" }));

    expect(onQueueFilterChange).toHaveBeenCalledWith("not_hidden");
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
    expect(screen.getByRole("menuitem", { name: "Unsaved translations" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "QA issues" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Machine translations" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "With comments" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Advanced Filter…" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "View options" }));
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

    expect(screen.queryByRole("button", { name: "View options" })).not.toBeInTheDocument();
  });

  it("keeps search and filter visible until strings are selected", () => {
    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        selectionMode
        onSelectionModeChange={vi.fn()}
        selectedCount={0}
        queueFilter="all"
        onQueueFilterChange={vi.fn()}
        onBulkApprove={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Filter queue" })).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Bulk actions" })).not.toBeInTheDocument();
  });

  it("offers Hide and Unhide in the bulk bar More menu", async () => {
    const user = userEvent.setup();
    const onBulkHide = vi.fn();
    const onBulkUnhide = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        selectionMode
        onSelectionModeChange={vi.fn()}
        selectedCount={2}
        onBulkHide={onBulkHide}
        onBulkUnhide={onBulkUnhide}
      />,
    );

    expect(screen.getByRole("toolbar", { name: "Bulk actions" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menuitem", { name: "Unhide selected" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Hide selected" }));

    expect(onBulkHide).toHaveBeenCalled();
  });

  it("offers Lock and Unlock in the bulk bar More menu", async () => {
    const user = userEvent.setup();
    const onBulkLock = vi.fn();
    const onBulkUnlock = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        selectionMode
        onSelectionModeChange={vi.fn()}
        selectedCount={2}
        onBulkLock={onBulkLock}
        onBulkUnlock={onBulkUnlock}
      />,
    );

    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menuitem", { name: "Lock selected" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Unlock selected" }));

    expect(onBulkUnlock).toHaveBeenCalled();
  });

  it("exits selection mode from the bulk bar", async () => {
    const user = userEvent.setup();
    const onSelectionModeChange = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        selectionMode
        onSelectionModeChange={onSelectionModeChange}
        selectedCount={2}
        onBulkApprove={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(onSelectionModeChange).toHaveBeenCalledWith(false);
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

    const selectAll = screen.getByRole("button", { name: /Select all visible/ });
    const approveSelected = screen.getByRole("button", { name: "Approve selected" });
    expect(selectAll).toBeDisabled();
    expect(approveSelected).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "More" }));
    const hideSelected = screen.getByRole("menuitem", { name: "Hide selected" });
    expect(hideSelected).toHaveAttribute("aria-disabled", "true");

    await user.click(hideSelected);

    expect(onSelectAllVisible).not.toHaveBeenCalled();
    expect(onBulkHide).not.toHaveBeenCalled();
    expect(onBulkApprove).not.toHaveBeenCalled();
  });

  it("disables select-all while a bulk action is pending", async () => {
    const user = userEvent.setup();
    const onSelectAllVisible = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        selectionMode
        onSelectionModeChange={vi.fn()}
        visibleCount={12}
        selectedCount={3}
        isBulkActionPending
        onSelectAllVisible={onSelectAllVisible}
        onClearChecked={vi.fn()}
        onBulkApprove={vi.fn()}
      />,
    );

    const selectAll = screen.getByRole("button", { name: /Select all visible/ });
    expect(selectAll).toBeDisabled();
    expect(screen.getByRole("button", { name: "More" })).toBeDisabled();

    await user.click(selectAll);

    expect(onSelectAllVisible).not.toHaveBeenCalled();
  });

  it("shows the Select toggle when onSelectionModeChange is provided, even without bulk handlers", async () => {
    const user = userEvent.setup();
    const onSelectionModeChange = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar onSelectionModeChange={onSelectionModeChange} />,
    );

    const selectToggle = screen.getByRole("button", { name: "Select" });
    expect(selectToggle).toHaveAttribute("aria-pressed", "false");

    await user.click(selectToggle);
    expect(onSelectionModeChange).toHaveBeenCalledWith(true);
  });

  it("selects All, untranslated first from the Crowdin-style filter menu", async () => {
    const user = userEvent.setup();
    const onQueueFilterChange = vi.fn();
    const onQueueSortChange = vi.fn();
    const onQueueFilterQualifierChange = vi.fn();
    const onQueueAdvancedChange = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        queueFilter="untranslated"
        queueSort="file_order"
        onQueueFilterChange={onQueueFilterChange}
        onQueueSortChange={onQueueSortChange}
        onQueueFilterQualifierChange={onQueueFilterQualifierChange}
        onQueueAdvancedChange={onQueueAdvancedChange}
        availableQueueFilters={["all", "untranslated"]}
        availableQueueSorts={["file_order", "untranslated_first"]}
        providerKind="crowdin"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filter queue" }));
    await user.click(screen.getByRole("menuitem", { name: "All, untranslated first" }));

    expect(onQueueFilterChange).toHaveBeenCalledWith("all");
    expect(onQueueSortChange).toHaveBeenCalledWith("untranslated_first");
    expect(onQueueFilterQualifierChange).toHaveBeenCalledWith(undefined);
    expect(onQueueAdvancedChange).toHaveBeenCalledWith(undefined);
  });

  it("lists QA qualifier submenu items", async () => {
    const user = userEvent.setup();

    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        queueFilter="all"
        onQueueFilterChange={vi.fn()}
        availableQueueFilters={["all", "qa_issues"]}
        providerKind="native"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filter queue" }));
    const qaIssues = screen.getByRole("menuitem", { name: "QA issues" });
    await user.hover(qaIssues);
    qaIssues.focus();
    await user.keyboard("{ArrowRight}");

    expect(await screen.findByRole("menuitem", { name: "Spelling" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "All" })).toBeInTheDocument();
  });

  it("opens the advanced filter dialog and applies native fields", async () => {
    const user = userEvent.setup();
    const onQueueFilterChange = vi.fn();
    const onQueueAdvancedChange = vi.fn();
    const onQueueFilterQualifierChange = vi.fn();

    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        queueFilter="all"
        onQueueFilterChange={onQueueFilterChange}
        onQueueAdvancedChange={onQueueAdvancedChange}
        onQueueFilterQualifierChange={onQueueFilterQualifierChange}
        availableQueueFilters={["all", "untranslated"]}
        providerKind="native"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filter queue" }));
    await user.click(screen.getByRole("menuitem", { name: "Advanced Filter…" }));

    expect(await screen.findByRole("dialog", { name: "Advanced Filter" })).toBeInTheDocument();
    expect(screen.queryByText("Screenshots")).not.toBeInTheDocument();
    expect(screen.queryByText("Labels: Include All")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("String type"));
    await user.click(screen.getByRole("option", { name: "ICU" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onQueueFilterChange).toHaveBeenCalledWith("all");
    expect(onQueueFilterQualifierChange).toHaveBeenCalledWith(undefined);
    expect(onQueueAdvancedChange).toHaveBeenCalledWith({ stringType: "icu" });
  });

  it("hides the advanced filter for providers that do not support it", async () => {
    const user = userEvent.setup();

    renderWithContentEditorProviders(
      <ContentEditorQueueToolbar
        queueFilter="all"
        onQueueFilterChange={vi.fn()}
        availableQueueFilters={["all"]}
        providerKind="phrase"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filter queue" }));
    expect(screen.queryByRole("menuitem", { name: "Advanced Filter…" })).not.toBeInTheDocument();
  });
});
