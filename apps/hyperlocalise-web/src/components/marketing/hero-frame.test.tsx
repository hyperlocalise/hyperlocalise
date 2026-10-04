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
import { afterEach, describe, expect, it } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { HeroFrame } from "./hero-frame";

const CAT_VIEW_MODE_STORAGE_KEY = "content-editor-workspace-view-mode:v1";

describe("HeroFrame", () => {
  afterEach(() => {
    window.localStorage.removeItem(CAT_VIEW_MODE_STORAGE_KEY);
  });

  it("starts the homepage CAT demo in comfortable view without changing the persisted workspace preference", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(CAT_VIEW_MODE_STORAGE_KEY, "side-by-side");

    renderWithContentEditorProviders(<HeroFrame />);

    expect(await screen.findByText("Translation Intelligence")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "View options" }));
    expect(await screen.findByRole("menuitemradio", { name: "Comfortable" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(window.localStorage.getItem(CAT_VIEW_MODE_STORAGE_KEY)).toBe("side-by-side");
  });
});
