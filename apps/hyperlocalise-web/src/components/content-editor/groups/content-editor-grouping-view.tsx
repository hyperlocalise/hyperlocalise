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
import { Activity, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import {
  attemptCatPageNavigation,
  type ContentEditorPageNavigationGuardRef,
} from "../workspace/content-editor-page-navigation-guard";
import { ContentEditorGroupBrowser, GroupLoading } from "./content-editor-group-browser";
import { groupMessages as m } from "./content-editor-groups.messages";

type View = "individual" | "grouped";

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
}) {
  if (!props.enabled) return props.children;
  return <PersonalGroupingView {...props} />;
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
  const intl = useIntl();
  const [preference, setPreference] = useState<View | null>(null);
  const [ready, setReady] = useState(false);
  const [defaultView, setDefaultView] = useState<View | null>(null);
  const [openedDirectly, setOpenedDirectly] = useState(Boolean(initialSegmentKey));
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "individual" || saved === "grouped") setPreference(saved);
    } catch {
      /* Storage may be unavailable; the in-memory preference still works. */
    }
    setReady(true);
  }, [storageKey]);
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
  const changeView = (next: View | null) =>
    attemptCatPageNavigation(navigationGuardRef, () => {
      setOpenedDirectly(false);
      setPreference(next);
      try {
        if (next === null) window.localStorage.removeItem(storageKey);
        else window.localStorage.setItem(storageKey, next);
      } catch {
        /* Keep the view usable when browser storage is disabled. */
      }
    });
  if (!ready || (!preference && !defaultView && !openedDirectly)) return <GroupLoading />;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={view}
          onValueChange={(value) => {
            if (value === "individual" || value === "grouped") changeView(value);
          }}
        >
          <SelectTrigger aria-label={intl.formatMessage(m.view)}>
            <SelectValue>{intl.formatMessage(m[view])}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="individual">
                <FormattedMessage {...m.individual} />
              </SelectItem>
              <SelectItem value="grouped">
                <FormattedMessage {...m.grouped} />
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        {preference ? (
          <Button variant="ghost" size="sm" onClick={() => changeView(null)}>
            <FormattedMessage {...m.projectDefault} />
          </Button>
        ) : null}
      </div>
      <Activity mode={view === "individual" ? "visible" : "hidden"}>{children}</Activity>
      {view === "grouped" ? (
        <ContentEditorGroupBrowser
          key={`${scope.sourcePath}:${scope.sourcePaths ?? ""}:${scope.targetLocale}`}
          {...scope}
        />
      ) : null}
    </>
  );
}
