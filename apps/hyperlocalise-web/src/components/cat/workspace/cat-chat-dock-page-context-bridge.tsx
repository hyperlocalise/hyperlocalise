"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { reaction } from "mobx";
import { useEffect } from "react";

import type { ChatDockPageContext } from "@/components/app-shell/chat-dock/chat-dock-store";
import { useOptionalAppShellStore } from "@/components/app-shell/store/app-shell-store-context";

import { useCatWorkspace } from "./cat-workspace-context";

function toChatDockPageContext(
  segmentId: string,
  key: string,
  sourceText: string,
  contextLabel: string | undefined,
  sourcePath: string | undefined,
): ChatDockPageContext {
  return {
    kind: "cat-segment",
    segmentId,
    key,
    sourceText,
    contextLabel,
    sourcePath,
  };
}

/**
 * Mirrors the selected CAT segment into ChatDockStore.pageContext so suggestion
 * pills can reference the current string. Chat dock sits outside CatWorkspaceProvider.
 */
export function CatChatDockPageContextBridge() {
  const workspace = useCatWorkspace();
  const appShell = useOptionalAppShellStore();

  useEffect(() => {
    const chatDock = appShell?.chatDock;
    if (!chatDock) {
      return;
    }

    return reaction(
      () => {
        const segment = workspace.selectedSegmentView;
        if (!segment) {
          return null;
        }

        return toChatDockPageContext(
          segment.id,
          segment.key,
          segment.sourceText,
          segment.contextLabel,
          workspace.fileContext.sourcePath,
        );
      },
      (context) => {
        chatDock.setPageContext(context);
      },
      { fireImmediately: true },
    );
  }, [appShell, workspace]);

  useEffect(() => {
    const chatDock = appShell?.chatDock;
    if (!chatDock) {
      return;
    }

    return () => {
      chatDock.clearPageContext();
    };
  }, [appShell]);

  return null;
}
