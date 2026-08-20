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
import type { ReactNode } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { useIntl } from "react-intl";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/primitives/cn";

import { catWorkspaceViewMessages } from "./cat-workspace.messages";

export const CAT_COMFORTABLE_LAYOUT_ID = "cat-workspace-comfortable";
export const CAT_SIDE_BY_SIDE_LAYOUT_ID = "cat-workspace-side-by-side";

const COMFORTABLE_PANEL_IDS = ["queue", "editor", "intelligence"] as const;
const SIDE_BY_SIDE_PANEL_IDS = ["editor", "intelligence"] as const;

const QUEUE_DEFAULT_SIZE = "20rem";
const QUEUE_MIN_SIZE = "14rem";
const QUEUE_MAX_SIZE = "36rem";
const EDITOR_MIN_SIZE = "24rem";
const INTELLIGENCE_DEFAULT_SIZE = "22rem";
const INTELLIGENCE_MIN_SIZE = "16rem";
const INTELLIGENCE_MAX_SIZE = "40rem";

function CatResizablePane({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">{children}</div>;
}

export function CatComfortableResizableLayout({
  queue,
  editor,
  intelligence,
  className,
}: {
  queue: ReactNode;
  editor: ReactNode;
  intelligence: ReactNode;
  className?: string;
}) {
  const intl = useIntl();
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: CAT_COMFORTABLE_LAYOUT_ID,
    panelIds: [...COMFORTABLE_PANEL_IDS],
    onlySaveAfterUserInteractions: true,
  });

  return (
    <ResizablePanelGroup
      id={CAT_COMFORTABLE_LAYOUT_ID}
      orientation="horizontal"
      className={cn("h-full min-h-0 min-w-0 flex-1 overflow-hidden", className)}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <ResizablePanel
        id="queue"
        defaultSize={QUEUE_DEFAULT_SIZE}
        minSize={QUEUE_MIN_SIZE}
        maxSize={QUEUE_MAX_SIZE}
        className="min-h-0 min-w-0 overflow-hidden"
      >
        <CatResizablePane>{queue}</CatResizablePane>
      </ResizablePanel>
      <ResizableHandle
        withHandle
        aria-label={intl.formatMessage(catWorkspaceViewMessages.resizeQueuePanel)}
      />
      <ResizablePanel
        id="editor"
        minSize={EDITOR_MIN_SIZE}
        className="min-h-0 min-w-0 overflow-hidden"
      >
        <CatResizablePane>{editor}</CatResizablePane>
      </ResizablePanel>
      <ResizableHandle
        withHandle
        aria-label={intl.formatMessage(catWorkspaceViewMessages.resizeIntelligencePanel)}
      />
      <ResizablePanel
        id="intelligence"
        defaultSize={INTELLIGENCE_DEFAULT_SIZE}
        minSize={INTELLIGENCE_MIN_SIZE}
        maxSize={INTELLIGENCE_MAX_SIZE}
        className="min-h-0 min-w-0 overflow-hidden"
      >
        <CatResizablePane>{intelligence}</CatResizablePane>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export function CatSideBySideResizableLayout({
  editor,
  intelligence,
  className,
}: {
  editor: ReactNode;
  intelligence: ReactNode;
  className?: string;
}) {
  const intl = useIntl();
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: CAT_SIDE_BY_SIDE_LAYOUT_ID,
    panelIds: [...SIDE_BY_SIDE_PANEL_IDS],
    onlySaveAfterUserInteractions: true,
  });

  return (
    <ResizablePanelGroup
      id={CAT_SIDE_BY_SIDE_LAYOUT_ID}
      orientation="horizontal"
      className={cn("h-full min-h-0 min-w-0 overflow-hidden", className)}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <ResizablePanel
        id="editor"
        minSize={EDITOR_MIN_SIZE}
        className="min-h-0 min-w-0 overflow-hidden"
      >
        <CatResizablePane>{editor}</CatResizablePane>
      </ResizablePanel>
      <ResizableHandle
        withHandle
        aria-label={intl.formatMessage(catWorkspaceViewMessages.resizeIntelligencePanel)}
      />
      <ResizablePanel
        id="intelligence"
        defaultSize={INTELLIGENCE_DEFAULT_SIZE}
        minSize={INTELLIGENCE_MIN_SIZE}
        maxSize={INTELLIGENCE_MAX_SIZE}
        className="min-h-0 min-w-0 overflow-hidden"
      >
        <CatResizablePane>{intelligence}</CatResizablePane>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
