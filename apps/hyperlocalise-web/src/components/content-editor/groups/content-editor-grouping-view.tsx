"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { CAT_QUEUE_TOOLBAR_HOST_ID } from "@/components/content-editor/queue/content-editor-queue-toolbar-host";
import { SegmentActivityProvider } from "../activity-log/content-editor-segment-activity";
import {
  ContentEditorGroupingProvider,
  type ContentEditorGroupingController,
} from "./content-editor-grouping-context";
import { ContentEditorGroupingViewSwitcher } from "./content-editor-grouping-view-switcher";

/**
 * Provides grouped-queue state to the editor layouts and places the view switcher in the
 * queue toolbar. Grouping only changes how the queue is fetched; the editor stays the same.
 */
export function ContentEditorGroupingView({
  grouping,
  targetLocale,
  children,
}: {
  grouping: ContentEditorGroupingController | null;
  targetLocale: string;
  children: ReactNode;
}) {
  if (!grouping) return children;
  return (
    <SegmentActivityProvider
      client={grouping.client}
      organizationSlug={grouping.organizationSlug}
      projectId={grouping.projectId}
      sourcePath={grouping.sourcePath}
      targetLocale={targetLocale}
    >
      <ContentEditorGroupingProvider value={grouping}>
        <GroupingViewSwitcherSlot />
        {children}
      </ContentEditorGroupingProvider>
    </SegmentActivityProvider>
  );
}

function GroupingViewSwitcherSlot() {
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null | undefined>(undefined);
  useEffect(() => {
    setToolbarHost(document.getElementById(CAT_QUEUE_TOOLBAR_HOST_ID));
  }, []);
  if (toolbarHost === undefined) return null;
  if (toolbarHost) return createPortal(<ContentEditorGroupingViewSwitcher compact />, toolbarHost);
  return <ContentEditorGroupingViewSwitcher />;
}
