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

import { render } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { createContentEditorWorkspaceState } from "@/components/content-editor/shared/content-editor.fixture";
import { ContentEditorWorkspaceContext } from "./content-editor-workspace-context";
import { createCatWorkspace } from "./content-editor-workspace-orchestrator";
import { ContentEditorWorkspaceViewModeSync } from "./content-editor-workspace-view-mode-sync";

describe("ContentEditorWorkspaceViewModeSync", () => {
  it("preserves saved translator preference when navigating from visual file back to text segment in mixed workspaces", () => {
    localStorage.clear();

    const mixedState = createContentEditorWorkspaceState({
      selectedSegmentId: "seg-text-1",
      fileContext: {
        sourcePath: "*",
        filename: "All Files",
        sourceLocale: "en-US",
        targetLocale: "vi",
        providerKind: null,
        canEditTranslations: true,
        canAddComments: true,
      },
      segments: [
        {
          id: "seg-text-1",
          index: 1,
          key: "greeting",
          sourceText: "Hello world",
          targetText: "Xin chào thế giới",
          status: "reviewed",
          sourcePath: "messages/en.json",
          sourceLocale: "en-US",
          targetLocale: "vi",
        },
        {
          id: "seg-img-1",
          index: 2,
          key: "banner",
          sourceText: "marketing/hero.png",
          targetText: "marketing/hero.png",
          status: "reviewed",
          sourcePath: "marketing/hero.png",
          contentKind: "image_file",
          sourceLocale: "en-US",
          targetLocale: "vi",
        },
      ],
    });

    const store = createCatWorkspace(mixedState);
    store.ui.setAdaptiveWorkspaceEnabled(true);

    render(
      <ContentEditorWorkspaceContext.Provider value={store}>
        <ContentEditorWorkspaceViewModeSync onPageLimitChange={vi.fn()} />
      </ContentEditorWorkspaceContext.Provider>,
    );

    // Initial segment is text: defaults to translator persona in comfortable view
    expect(store.ui.workspacePersona).toBe("translator");
    expect(store.ui.viewMode).toBe("comfortable");
    expect(localStorage.getItem("content-editor-workspace-persona:v1:text")).toBe("translator");

    // Select the image segment
    act(() => {
      store.setSelectedSegmentId("seg-img-1");
    });

    // Synchronizes to image family (designer persona, file view)
    expect(store.ui.workspacePersona).toBe("designer");
    expect(store.ui.viewMode).toBe("file");
    expect(localStorage.getItem("content-editor-workspace-persona:v1:image")).toBe("designer");

    // Select back to text segment
    act(() => {
      store.setSelectedSegmentId("seg-text-1");
    });

    // Persona must remain translator and viewMode comfortable; must not be overwritten with reviewer!
    expect(store.ui.workspacePersona).toBe("translator");
    expect(store.ui.viewMode).toBe("comfortable");
    expect(localStorage.getItem("content-editor-workspace-persona:v1:text")).toBe("translator");
  });
});
