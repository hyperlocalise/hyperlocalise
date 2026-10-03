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
import { Activity, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useQuery } from "@tanstack/react-query";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { CAT_QUEUE_TOOLBAR_HOST_ID } from "@/components/content-editor/queue/content-editor-queue-toolbar-host";
import {
  attemptCatPageNavigation,
  type ContentEditorPageNavigationGuardRef,
} from "../workspace/content-editor-page-navigation-guard";
import {
  ContentEditorGroupingProvider,
  type ContentEditorGroupingViewMode,
} from "./content-editor-grouping-context";
import { ContentEditorGroupingViewSwitcher } from "./content-editor-grouping-view-switcher";
import { ContentEditorGroupBrowser, GroupLoading } from "./content-editor-group-browser";

import { SegmentActivityProvider } from "../activity-log/content-editor-segment-activity";

type View = ContentEditorGroupingViewMode;

export function ContentEditorGroupingView(props: {
  client: GoSvcClient;
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  sourcePaths?: string;
  targetLocale: string;
  children: ReactNode;
  navigationGuardRef: ContentEditorPageNavigationGuardRef;
  initialSegmentKey?: string | null;
  enabled: boolean;
  canEdit?: boolean;
}) {
  if (!props.enabled) return props.children;
  return (
    <SegmentActivityProvider
      client={props.client}
      organizationSlug={props.organizationSlug}
      projectId={props.projectId}
      sourcePath={props.sourcePath}
      targetLocale={props.targetLocale}
    >
      <PersonalGroupingView {...props} />
    </SegmentActivityProvider>
  );
}

function PersonalGroupingView(props: Parameters<typeof ContentEditorGroupingView>[0]) {
  const { user } = useAuth();
  const storageKey = `cat-grouping-v1:${user?.id ?? "anonymous"}:${props.organizationSlug}:${props.projectId}`;
  return <GroupingViewState key={storageKey} {...props} storageKey={storageKey} />;
}

function GroupingViewState({
  children,
  navigationGuardRef,
  initialSegmentKey,
  storageKey,
  ...scope
}: Parameters<typeof ContentEditorGroupingView>[0] & { storageKey: string }) {
  const [preference, setPreference] = useState<View | null>(null);
  const [ready, setReady] = useState(false);
  const [defaultView, setDefaultView] = useState<View | null>(null);
  const [openedDirectly, setOpenedDirectly] = useState(Boolean(initialSegmentKey));
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null | undefined>(undefined);
  useEffect(() => {
    setOpenedDirectly(Boolean(initialSegmentKey));
  }, [initialSegmentKey]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "individual" || saved === "grouped") setPreference(saved);
    } catch {
      /* Storage may be unavailable; the in-memory preference still works. */
    }
    setReady(true);
  }, [storageKey]);
  useEffect(() => {
    setToolbarHost(document.getElementById(CAT_QUEUE_TOOLBAR_HOST_ID));
  }, []);
  const behavior = useQuery({
    queryKey: ["cat-grouping-default", scope.organizationSlug, scope.projectId],
    queryFn: ({ signal }) =>
      scope.client.project.contentEditorBehavior(scope.organizationSlug, scope.projectId, {
        signal,
      }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  // Snapshot the default once. A later policy refresh must not hide an active draft.
  if (defaultView === null && (behavior.data || behavior.isError)) {
    setDefaultView(
      behavior.data?.contentEditorBehavior.automaticallyGroupIdenticalStrings
        ? "grouped"
        : "individual",
    );
  }
  const view = openedDirectly ? "individual" : (preference ?? defaultView ?? "individual");
  const changeView = useCallback(
    (next: View | null) =>
      attemptCatPageNavigation(navigationGuardRef, () => {
        setOpenedDirectly(false);
        setPreference(next);
        try {
          if (next === null) window.localStorage.removeItem(storageKey);
          else window.localStorage.setItem(storageKey, next);
        } catch {
          /* Keep the view usable when browser storage is disabled. */
        }
      }),
    [navigationGuardRef, storageKey],
  );
  const grouping = useMemo(
    () => ({ view, preference, changeView }),
    [changeView, preference, view],
  );
  if (!ready || (!preference && !defaultView && !openedDirectly)) return <GroupLoading />;
  const switcher =
    toolbarHost === undefined ? null : (
      <ContentEditorGroupingViewSwitcher compact={Boolean(toolbarHost)} />
    );
  return (
    <ContentEditorGroupingProvider value={grouping}>
      {toolbarHost ? createPortal(switcher, toolbarHost) : switcher}
      <Activity mode={view === "individual" ? "visible" : "hidden"}>{children}</Activity>
      {view === "grouped" ? (
        <ContentEditorGroupBrowser
          key={`${scope.sourcePath}:${scope.sourcePaths ?? ""}:${scope.targetLocale}`}
          {...scope}
        />
      ) : null}
    </ContentEditorGroupingProvider>
  );
}
