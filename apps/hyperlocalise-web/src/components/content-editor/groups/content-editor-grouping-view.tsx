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
import type { ReactNode } from "react";

import { SegmentActivityProvider } from "../activity-log/content-editor-segment-activity";
import {
  ContentEditorGroupingProvider,
  type ContentEditorGroupingController,
} from "./content-editor-grouping-context";

/**
 * Provides grouped-queue state to the editor layouts; the queue toolbar's View menu
 * switches it. Grouping only changes how the queue is fetched; the editor stays the same.
 */
export function ContentEditorGroupingView({
  grouping,
  historyWithoutGrouping,
  targetLocale,
  children,
}: {
  grouping: ContentEditorGroupingController | null;
  /**
   * A string's history where there is no grouped view: someone here through a task has no
   * grouping, and still reads and restores the versions of their task's strings.
   */
  historyWithoutGrouping?: Pick<
    ContentEditorGroupingController,
    "client" | "organizationSlug" | "projectId" | "sourcePath"
  >;
  targetLocale: string;
  children: ReactNode;
}) {
  if (!grouping) {
    return historyWithoutGrouping ? (
      <SegmentActivityProvider {...historyWithoutGrouping} targetLocale={targetLocale}>
        {children}
      </SegmentActivityProvider>
    ) : (
      children
    );
  }
  return (
    <SegmentActivityProvider
      client={grouping.client}
      organizationSlug={grouping.organizationSlug}
      projectId={grouping.projectId}
      sourcePath={grouping.sourcePath}
      targetLocale={targetLocale}
    >
      <ContentEditorGroupingProvider value={grouping}>{children}</ContentEditorGroupingProvider>
    </SegmentActivityProvider>
  );
}
