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

import {
  ContentEditorReviewerBulkBar,
  type ContentEditorReviewerBulkActions,
} from "./content-editor-reviewer-bulk-bar";

describe("ContentEditorReviewerBulkBar", () => {
  function renderBulkBar(
    overrides: Partial<Parameters<typeof ContentEditorReviewerBulkBar>[0]> = {},
  ) {
    const actions: ContentEditorReviewerBulkActions = {
      isBlocked: false,
      onSelectAllVisible: vi.fn(),
      onApprove: vi.fn(),
      onSkip: vi.fn(),
      onHide: vi.fn(),
      onUnhide: vi.fn(),
      onLock: vi.fn(),
      onUnlock: vi.fn(),
      ...overrides.actions,
    };

    const props: Parameters<typeof ContentEditorReviewerBulkBar>[0] = {
      visibleSegmentIds: ["seg-01", "seg-02", "seg-03"],
      checkedSegmentIds: new Set(["seg-01"]),
      actions,
      isPending: false,
      onClearChecked: vi.fn(),
      ...overrides,
    };

    return {
      props,
      actions,
      ...renderWithContentEditorProviders(<ContentEditorReviewerBulkBar {...props} />),
    };
  }

  it("renders selected count and triggers approve when Approve clicked", async () => {
    const user = userEvent.setup();
    const { actions } = renderBulkBar({ checkedSegmentIds: new Set(["seg-01", "seg-02"]) });

    expect(screen.getByText("2 selected")).toBeInTheDocument();

    const approveButton = screen.getByRole("button", { name: "Approve" });
    await user.click(approveButton);

    expect(actions.onApprove).toHaveBeenCalledTimes(1);
  });

  it("triggers skip when Skip clicked", async () => {
    const user = userEvent.setup();
    const { actions } = renderBulkBar({ checkedSegmentIds: new Set(["seg-01"]) });

    const skipButton = screen.getByRole("button", { name: "Skip" });
    await user.click(skipButton);

    expect(actions.onSkip).toHaveBeenCalledTimes(1);
  });

  it("calls onClearChecked when Clear button clicked", async () => {
    const user = userEvent.setup();
    const onClearChecked = vi.fn();
    renderBulkBar({ onClearChecked, checkedSegmentIds: new Set(["seg-01"]) });

    const clearButton = screen.getByRole("button", { name: "Clear" });
    await user.click(clearButton);

    expect(onClearChecked).toHaveBeenCalledTimes(1);
  });

  it("disables actions when actions.isBlocked is true", () => {
    const actions: ContentEditorReviewerBulkActions = {
      isBlocked: true,
      onSelectAllVisible: vi.fn(),
      onApprove: vi.fn(),
      onSkip: vi.fn(),
    };
    renderBulkBar({ actions, checkedSegmentIds: new Set(["seg-01"]) });

    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip" })).toBeDisabled();
  });
});
