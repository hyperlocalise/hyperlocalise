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

import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { createContentEditorWorkspaceState } from "@/components/content-editor/shared/content-editor.fixture";
import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { ContentEditorWorkspaceContext } from "@/components/content-editor/workspace/content-editor-workspace-context";
import { createCatWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-orchestrator";

import { ContentEditorQueueToolbarConnected } from "./content-editor-queue-toolbar-connected";

describe("ContentEditorQueueToolbarConnected", () => {
  it("names the language on bulk approve only in the multilingual layout", () => {
    const workspace = createCatWorkspace(
      createContentEditorWorkspaceState({
        selectedSegmentId: "seg-02",
        fileContext: { targetLocale: "de-DE" },
      }),
    );
    workspace.setSelectionMode(true, { persist: false });
    workspace.toggleSegmentChecked("seg-02", true);
    workspace.ui.setViewMode("multilingual", { persistViewMode: false });

    renderWithContentEditorProviders(
      <ContentEditorWorkspaceContext.Provider value={workspace}>
        <ContentEditorQueueToolbarConnected onBulkApprove={vi.fn()} />
      </ContentEditorWorkspaceContext.Provider>,
    );

    expect(screen.getByRole("button", { name: "Approve in German (Germany)" })).toBeInTheDocument();

    act(() => workspace.ui.setViewMode("side-by-side", { persistViewMode: false }));

    expect(screen.getByRole("button", { name: "Approve selected" })).toBeInTheDocument();
  });
});
