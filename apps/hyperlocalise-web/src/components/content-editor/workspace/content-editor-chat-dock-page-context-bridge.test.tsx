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

import { type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  AppShellStoreProvider,
  useAppShellStore,
} from "@/components/app-shell/store/app-shell-store-context";
import { createContentEditorWorkspaceState } from "@/components/content-editor/shared/content-editor.fixture";
import {
  ContentEditorWorkspaceProvider,
  useContentEditorWorkspace,
} from "@/components/content-editor/workspace/content-editor-workspace-context";

import { ContentEditorChatDockPageContextBridge } from "./content-editor-chat-dock-page-context-bridge";

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/projects/proj_1/cat",
}));

function createWrapper(initialSegmentId = "seg-02") {
  const initialState = createContentEditorWorkspaceState({ selectedSegmentId: initialSegmentId });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AppShellStoreProvider defaultNavigationGroups={[]}>
        <ContentEditorWorkspaceProvider initialState={initialState}>
          <ContentEditorChatDockPageContextBridge projectId="proj_1" />
          {children}
        </ContentEditorWorkspaceProvider>
      </AppShellStoreProvider>
    );
  };
}

describe("ContentEditorChatDockPageContextBridge", () => {
  it("mirrors the selected CAT segment into chat dock page context", async () => {
    const { result } = renderHook(
      () => ({
        chatDock: useAppShellStore().chatDock,
        workspace: useContentEditorWorkspace(),
      }),
      { wrapper: createWrapper("seg-02") },
    );

    await waitFor(() => {
      expect(result.current.chatDock.pageContext).toMatchObject({
        kind: "content-editor-segment",
        segmentId: "seg-02",
        projectId: "proj_1",
      });
    });

    const context = result.current.chatDock.pageContext;
    expect(context?.kind).toBe("content-editor-segment");
    if (context?.kind !== "content-editor-segment") {
      return;
    }

    expect(context.key).toBeTruthy();
    expect(context.sourceText).toBeTruthy();
    expect(context.projectSource).toBe("native");
    expect(context.externalProviderKind).toBeNull();
    expect(context.sourceLocale).toBeTruthy();
    expect(context.targetLocale).toBeTruthy();

    result.current.workspace.setSelectedSegmentId("seg-01");

    await waitFor(() => {
      expect(result.current.chatDock.pageContext?.segmentId).toBe("seg-01");
    });
  });
});
