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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorExpandableContent } from "./content-editor-show-more-fade";

function mockLayout({ content, clip }: { content: number; clip: number }) {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(content);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(clip);
}

describe("ContentEditorExpandableContent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not offer show more when the content fits in five lines", () => {
    mockLayout({ content: 80, clip: 80 });
    renderWithContentEditorProviders(
      <ContentEditorExpandableContent>Short context</ContentEditorExpandableContent>,
    );

    expect(screen.queryByRole("button", { name: /Show more/i })).not.toBeInTheDocument();
  });

  it("collapses long content behind show more and expands it", async () => {
    const user = userEvent.setup();
    mockLayout({ content: 240, clip: 114 });
    renderWithContentEditorProviders(
      <ContentEditorExpandableContent>Long context</ContentEditorExpandableContent>,
    );

    await user.click(screen.getByRole("button", { name: /Show more/i }));
    expect(screen.getByRole("button", { name: /Show less/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Show less/i }));
    expect(screen.getByRole("button", { name: /Show more/i })).toBeInTheDocument();
  });
});
