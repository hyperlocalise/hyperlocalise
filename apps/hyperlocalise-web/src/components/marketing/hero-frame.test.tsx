/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
// @vitest-environment happy-dom

import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { renderWithCatProviders } from "@/components/cat/shared/cat-test-utils";

import { HeroFrame } from "./hero-frame";

const CAT_VIEW_MODE_STORAGE_KEY = "cat-workspace-view-mode:v1";

describe("HeroFrame", () => {
  afterEach(() => {
    window.localStorage.removeItem(CAT_VIEW_MODE_STORAGE_KEY);
  });

  it("starts the homepage CAT demo in comfortable view without changing the persisted workspace preference", async () => {
    window.localStorage.setItem(CAT_VIEW_MODE_STORAGE_KEY, "side-by-side");

    renderWithCatProviders(<HeroFrame />);

    const viewModeButton = await waitFor(() =>
      screen.getByRole("button", { name: "CAT view mode" }),
    );

    expect(viewModeButton).toHaveTextContent("Comfortable");
    expect(screen.getByText("Translation Intelligence")).toBeInTheDocument();
    expect(window.localStorage.getItem(CAT_VIEW_MODE_STORAGE_KEY)).toBe("side-by-side");
  });
});
