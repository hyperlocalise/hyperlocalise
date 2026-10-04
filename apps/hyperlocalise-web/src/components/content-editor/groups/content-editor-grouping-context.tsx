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
import { createContext, useContext, type ReactNode } from "react";

import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import type { CatGroupOccurrence } from "@/lib/go-svc/go-svc-cat-groups.types";
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";

export type ContentEditorGroupingViewMode = "individual" | "grouped";

export type ContentEditorGroupVariantSaveInput = {
  /** The grouped queue row. */
  segment: ContentEditorSegment;
  locale: string;
  /** Unlocked occurrences to write; other occurrences keep their translation. */
  occurrences: CatGroupOccurrence[];
  text: string;
  approve: boolean;
};

export type ContentEditorGroupingController = {
  view: ContentEditorGroupingViewMode;
  preference: ContentEditorGroupingViewMode | null;
  changeView: (next: ContentEditorGroupingViewMode | null) => void;
  client: GoSvcClient;
  organizationSlug: string;
  projectId: string;
  /** Queue scope of grouped rows: a file path or the all-files path. */
  sourcePath: string;
  sourcePaths?: string;
  canEdit: boolean;
  saveVariant: (input: ContentEditorGroupVariantSaveInput) => Promise<void>;
};

const ContentEditorGroupingContext = createContext<ContentEditorGroupingController | null>(null);

export function ContentEditorGroupingProvider({
  value,
  children,
}: {
  value: ContentEditorGroupingController;
  children: ReactNode;
}) {
  return (
    <ContentEditorGroupingContext.Provider value={value}>
      {children}
    </ContentEditorGroupingContext.Provider>
  );
}

export function useContentEditorGrouping() {
  return useContext(ContentEditorGroupingContext);
}
