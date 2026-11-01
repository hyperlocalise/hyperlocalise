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
import { createContentEditorWorkspaceState } from "@/components/content-editor/shared/content-editor.fixture";
import { ContentEditorWorkspaceProvider } from "@/components/content-editor/workspace/content-editor-workspace-context";

import { ContentEditorOverflowMenu } from "./content-editor-overflow-menu";

function renderOverflowMenu(props: Partial<Parameters<typeof ContentEditorOverflowMenu>[0]> = {}) {
  return renderWithContentEditorProviders(
    <ContentEditorWorkspaceProvider initialState={createContentEditorWorkspaceState()}>
      <ContentEditorOverflowMenu filterLabel="All strings" {...props} />
    </ContentEditorWorkspaceProvider>,
  );
}

describe("ContentEditorOverflowMenu", () => {
  it("offers bilingual import next to filtered download for native editors", async () => {
    const user = userEvent.setup();
    const onImportBilingualFile = vi.fn();

    renderOverflowMenu({
      onDownloadFilteredView: vi.fn(),
      onImportBilingualFile,
    });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Download filtered view…" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Import bilingual file…" })).toBeInTheDocument();
  });

  it("hides bilingual import when the callback is omitted", async () => {
    const user = userEvent.setup();

    renderOverflowMenu({
      onDownloadFilteredView: vi.fn(),
    });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      screen.queryByRole("menuitem", { name: "Import bilingual file…" }),
    ).not.toBeInTheDocument();
  });
});
