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
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useQuery } from "@tanstack/react-query";

import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import {
  attemptCatPageNavigation,
  type ContentEditorPageNavigationGuardRef,
} from "../workspace/content-editor-page-navigation-guard";
import type { ContentEditorGroupingViewMode } from "./content-editor-grouping-context";

type View = ContentEditorGroupingViewMode;

export type ContentEditorGroupingMode = {
  view: View;
  preference: View | null;
  changeView: (next: View | null) => void;
  /** False until the personal preference and project default are known. */
  ready: boolean;
};

/**
 * Resolves whether the queue loads one row per string or one row per identical source
 * text. A personal preference wins over the project default; a direct segment link
 * always opens individual strings so the linked row exists in the queue.
 */
export function useContentEditorGroupingMode(input: {
  client: GoSvcClient;
  organizationSlug: string;
  projectId: string;
  enabled: boolean;
  initialSegmentKey?: string | null;
  navigationGuardRef: ContentEditorPageNavigationGuardRef;
}): ContentEditorGroupingMode {
  const { user } = useAuth();
  const storageKey = `cat-grouping-v1:${user?.id ?? "anonymous"}:${input.organizationSlug}:${input.projectId}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [preference, setPreference] = useState<View | null>(null);
  const [defaultView, setDefaultView] = useState<View | null>(null);
  const [openedDirectly, setOpenedDirectly] = useState(Boolean(input.initialSegmentKey));

  useEffect(() => {
    setOpenedDirectly(Boolean(input.initialSegmentKey));
  }, [input.initialSegmentKey]);

  useEffect(() => {
    let saved: View | null = null;
    try {
      const value = window.localStorage.getItem(storageKey);
      if (value === "individual" || value === "grouped") saved = value;
    } catch {
      /* Storage may be unavailable; the in-memory preference still works. */
    }
    setPreference(saved);
    setLoadedKey(storageKey);
  }, [storageKey]);

  const needsDefault = input.enabled && loadedKey === storageKey && !preference;
  const behavior = useQuery({
    queryKey: ["cat-grouping-default", input.organizationSlug, input.projectId],
    queryFn: ({ signal }) =>
      input.client.project.contentEditorBehavior(input.organizationSlug, input.projectId, {
        signal,
      }),
    enabled: needsDefault && defaultView === null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  // Snapshot the default once. A later policy refresh must not regroup an active draft.
  if (defaultView === null && (behavior.data || behavior.isError)) {
    setDefaultView(
      behavior.data?.contentEditorBehavior.automaticallyGroupIdenticalStrings
        ? "grouped"
        : "individual",
    );
  }

  const changeView = useCallback(
    (next: View | null) =>
      attemptCatPageNavigation(input.navigationGuardRef, () => {
        setOpenedDirectly(false);
        setPreference(next);
        try {
          if (next === null) window.localStorage.removeItem(storageKey);
          else window.localStorage.setItem(storageKey, next);
        } catch {
          /* Keep the view usable when browser storage is disabled. */
        }
      }),
    [input.navigationGuardRef, storageKey],
  );

  if (!input.enabled) {
    return { view: "individual", preference, changeView, ready: true };
  }
  const view = openedDirectly ? "individual" : (preference ?? defaultView ?? "individual");
  const ready =
    loadedKey === storageKey && (openedDirectly || preference !== null || defaultView !== null);
  return { view, preference, changeView, ready };
}
