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

import { catSegmentsFixture } from "@/components/cat/shared/cat.fixture";
import { renderWithCatProviders } from "@/components/cat/shared/cat-test-utils";

import { CatQueuePanel } from "./cat-queue-panel";

describe("CatQueuePanel pagination", () => {
  it("offers a manual load-more fallback when more queue pages exist", async () => {
    const user = userEvent.setup();
    const onLoadMoreQueue = vi.fn();
    const segments = catSegmentsFixture.slice(0, 3);

    renderWithCatProviders(
      <CatQueuePanel
        segments={segments}
        selectedSegmentId={segments[0]!.id}
        onSelectSegment={vi.fn()}
        pagination={{
          offset: 0,
          limit: 3,
          returnedCount: 3,
          totalCount: 9,
          hasMore: true,
        }}
        hasMoreQueue
        onLoadMoreQueue={onLoadMoreQueue}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(onLoadMoreQueue).toHaveBeenCalledTimes(1);
  });
});

describe("CatQueuePanel bulk hide", () => {
  it("offers Hide and Unhide when those bulk handlers are provided", async () => {
    window.localStorage.setItem("cat-queue:selection-mode:v1", "false");
    const user = userEvent.setup();
    const onBulkHide = vi.fn();
    const onBulkUnhide = vi.fn();
    const segments = catSegmentsFixture.slice(0, 3);

    renderWithCatProviders(
      <CatQueuePanel
        segments={segments}
        selectedSegmentId={segments[0]!.id}
        onSelectSegment={vi.fn()}
        onToggleSegmentChecked={vi.fn()}
        onBulkHide={onBulkHide}
        onBulkUnhide={onBulkUnhide}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Show bulk selection checkboxes" }));
    await user.click(screen.getByRole("button", { name: "Queue actions" }));

    expect(screen.getByRole("menuitem", { name: "Hide selected" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Unhide selected" })).toBeDisabled();
  });

  it("includes Hidden in the Crowdin queue filter menu", async () => {
    const user = userEvent.setup();
    const onQueueFilterChange = vi.fn();
    const segments = catSegmentsFixture.slice(0, 3);

    renderWithCatProviders(
      <CatQueuePanel
        segments={segments}
        selectedSegmentId={segments[0]!.id}
        onSelectSegment={vi.fn()}
        queueFilter="all"
        onQueueFilterChange={onQueueFilterChange}
        availableQueueFilters={["all", "hidden"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filter queue" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Hidden" }));

    expect(onQueueFilterChange).toHaveBeenCalledWith("hidden");
  });
});
