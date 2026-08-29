"use client";

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
import { reaction } from "mobx";
import { useEffect } from "react";

import type { ChatDockPageContext } from "@/components/app-shell/chat-dock/chat-dock-store";
import { useOptionalAppShellStore } from "@/components/app-shell/store/app-shell-store-context";

import { useContentEditorWorkspace } from "./content-editor-workspace-context";

function resolveProjectSource(providerKind: string | null | undefined): "native" | "external_tms" {
  return providerKind ? "external_tms" : "native";
}

function toChatDockPageContext(input: {
  segmentId: string;
  key: string;
  sourceText: string;
  contextLabel: string | undefined;
  sourcePath: string | undefined;
  sourceLocale: string;
  targetLocale: string;
  providerKind: string | null;
  projectId?: string;
  projectName?: string;
}): ChatDockPageContext {
  return {
    kind: "content-editor-segment",
    segmentId: input.segmentId,
    key: input.key,
    sourceText: input.sourceText,
    contextLabel: input.contextLabel,
    sourcePath: input.sourcePath,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    projectId: input.projectId,
    projectName: input.projectName,
    projectSource: resolveProjectSource(input.providerKind),
    externalProviderKind: input.providerKind,
  };
}

/**
 * Mirrors the selected CAT segment into ChatDockStore.pageContext so suggestion
 * pills and the chat agent can reference the current string and project/TMS kind.
 * Chat dock sits outside ContentEditorWorkspaceProvider.
 */
export function ContentEditorChatDockPageContextBridge({ projectId }: { projectId?: string }) {
  const workspace = useContentEditorWorkspace();
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

        return toChatDockPageContext({
          segmentId: segment.id,
          key: segment.key,
          sourceText: segment.sourceText,
          contextLabel: segment.contextLabel,
          sourcePath: workspace.fileContext.sourcePath,
          sourceLocale: workspace.fileContext.sourceLocale,
          targetLocale: workspace.fileContext.targetLocale,
          providerKind: workspace.fileContext.providerKind,
          projectId,
        });
      },
      (context) => {
        chatDock.setPageContext(context);
      },
      { fireImmediately: true },
    );
  }, [appShell, projectId, workspace]);

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
