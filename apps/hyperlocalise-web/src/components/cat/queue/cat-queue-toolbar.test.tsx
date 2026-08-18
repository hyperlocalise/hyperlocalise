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

import { renderWithCatProviders } from "@/components/cat/shared/cat-test-utils";

import { CatQueueToolbar } from "./cat-queue-toolbar";

describe("CatQueueToolbar", () => {
  it("includes Hidden in the Crowdin queue filter menu", async () => {
    const user = userEvent.setup();
    const onQueueFilterChange = vi.fn();

    renderWithCatProviders(
      <CatQueueToolbar
        queueFilter="all"
        onQueueFilterChange={onQueueFilterChange}
        availableQueueFilters={["all", "hidden"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filter queue" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Hidden" }));

    expect(onQueueFilterChange).toHaveBeenCalledWith("hidden");
  });

  it("offers Hide and Unhide when those bulk handlers are provided", async () => {
    const user = userEvent.setup();
    const onBulkHide = vi.fn();
    const onBulkUnhide = vi.fn();

    renderWithCatProviders(
      <CatQueueToolbar
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
});
