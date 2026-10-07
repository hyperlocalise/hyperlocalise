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
import { describe, expect, it, vi } from "vite-plus/test";

import { createContentEditorWorkspaceState } from "@/components/content-editor/shared/content-editor.fixture";
import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { ContentEditorWorkspaceContext } from "@/components/content-editor/workspace/content-editor-workspace-context";
import { createCatWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-orchestrator";
import { ContentEditorPageHeader } from "./content-editor-page-header";

describe("ContentEditorPageHeader", () => {
  const defaultActions = {
    onSelectFile: vi.fn(),
    onLocaleChange: vi.fn(),
  };

  it("hides desktop file picker when adaptiveWorkspaceEnabled is false even if isFileView is true", () => {
    const state = createContentEditorWorkspaceState();
    const orchestrator = createCatWorkspace(state);
    orchestrator.page.files = [
      { sourcePath: "assets/logo.png", targetLocales: ["fr"], stringCount: 1 } as never,
    ];
    orchestrator.ui.setViewMode("file");
    orchestrator.ui.setAdaptiveWorkspaceEnabled(false);

    renderWithContentEditorProviders(
      <ContentEditorWorkspaceContext.Provider value={orchestrator}>
        <ContentEditorPageHeader backHref="/projects" actions={defaultActions} />
      </ContentEditorWorkspaceContext.Provider>,
    );

    const pickerButton = screen.getByRole("button", { name: "Source file" });
    const pickerContainer = pickerButton.parentElement;
    expect(pickerContainer).toHaveClass("lg:hidden");
    expect(pickerContainer).not.toHaveClass("inline-flex");
  });

  it("shows desktop file picker when adaptiveWorkspaceEnabled is true and isFileView is true", () => {
    const state = createContentEditorWorkspaceState();
    const orchestrator = createCatWorkspace(state);
    orchestrator.page.files = [
      { sourcePath: "assets/logo.png", targetLocales: ["fr"], stringCount: 1 } as never,
    ];
    orchestrator.ui.setAdaptiveWorkspaceEnabled(true);
    orchestrator.ui.setViewMode("file");

    renderWithContentEditorProviders(
      <ContentEditorWorkspaceContext.Provider value={orchestrator}>
        <ContentEditorPageHeader backHref="/projects" actions={defaultActions} />
      </ContentEditorWorkspaceContext.Provider>,
    );

    const pickerButton = screen.getByRole("button", { name: "Source file" });
    const pickerContainer = pickerButton.parentElement;
    expect(pickerContainer).toHaveClass("inline-flex");
    expect(pickerContainer).not.toHaveClass("lg:hidden");
  });

  it("renders headerTrailing in the header chrome", () => {
    const state = createContentEditorWorkspaceState();
    const orchestrator = createCatWorkspace(state);

    renderWithContentEditorProviders(
      <ContentEditorWorkspaceContext.Provider value={orchestrator}>
        <ContentEditorPageHeader
          backHref="/projects"
          actions={defaultActions}
          headerTrailing={<button type="button">Push to Intercom</button>}
        />
      </ContentEditorWorkspaceContext.Provider>,
    );

    expect(screen.getByRole("button", { name: "Push to Intercom" })).toBeInTheDocument();
  });
});
