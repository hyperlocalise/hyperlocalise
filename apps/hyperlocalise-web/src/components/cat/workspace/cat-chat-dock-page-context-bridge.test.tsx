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

import { type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  AppShellStoreProvider,
  useAppShellStore,
} from "@/components/app-shell/store/app-shell-store-context";
import { createCatWorkspaceState } from "@/components/cat/shared/cat.fixture";
import {
  CatWorkspaceProvider,
  useCatWorkspace,
} from "@/components/cat/workspace/cat-workspace-context";

import { CatChatDockPageContextBridge } from "./cat-chat-dock-page-context-bridge";

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/projects/proj_1/cat",
}));

function createWrapper(initialSegmentId = "seg-02") {
  const initialState = createCatWorkspaceState({ selectedSegmentId: initialSegmentId });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AppShellStoreProvider defaultNavigationGroups={[]}>
        <CatWorkspaceProvider initialState={initialState}>
          <CatChatDockPageContextBridge />
          {children}
        </CatWorkspaceProvider>
      </AppShellStoreProvider>
    );
  };
}

describe("CatChatDockPageContextBridge", () => {
  it("mirrors the selected CAT segment into chat dock page context", async () => {
    const { result } = renderHook(
      () => ({
        chatDock: useAppShellStore().chatDock,
        workspace: useCatWorkspace(),
      }),
      { wrapper: createWrapper("seg-02") },
    );

    await waitFor(() => {
      expect(result.current.chatDock.pageContext).toMatchObject({
        kind: "cat-segment",
        segmentId: "seg-02",
      });
    });

    const context = result.current.chatDock.pageContext;
    expect(context?.kind).toBe("cat-segment");
    if (context?.kind !== "cat-segment") {
      return;
    }

    expect(context.key).toBeTruthy();
    expect(context.sourceText).toBeTruthy();

    result.current.workspace.setSelectedSegmentId("seg-01");

    await waitFor(() => {
      expect(result.current.chatDock.pageContext?.segmentId).toBe("seg-01");
    });
  });
});
