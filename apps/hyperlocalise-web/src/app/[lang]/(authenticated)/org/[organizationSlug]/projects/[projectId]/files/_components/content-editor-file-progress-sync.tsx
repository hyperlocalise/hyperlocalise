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
import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useQuery } from "@tanstack/react-query";

import { useContentEditorWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-context";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { fetchProjectFileProgress, projectFileProgressQueryKey } from "./project-files-tree-panel";

const FILE_PROGRESS_STALE_TIME_MS = 30_000;
const FILE_PROGRESS_REFRESH_MS = 60_000;

/** Loads per-file progress for the editor's active locale into the page store. */
export const ContentEditorFileProgressSync = observer(function ContentEditorFileProgressSync({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const store = useContentEditorWorkspace();
  const { client: goSvcClient } = useGoSvcClient();
  const locale = store.page.targetLocale;
  const enabled = Boolean(locale) && store.page.showFileSidebar;

  const progressQuery = useQuery({
    queryKey: projectFileProgressQueryKey(organizationSlug, projectId, locale),
    queryFn: () => fetchProjectFileProgress(goSvcClient, organizationSlug, projectId, locale),
    enabled,
    staleTime: FILE_PROGRESS_STALE_TIME_MS,
    refetchInterval: FILE_PROGRESS_REFRESH_MS,
  });

  const page = store.page;
  const data = enabled ? progressQuery.data : undefined;
  useEffect(() => {
    page.setFileProgress(data);
  }, [data, page]);

  return null;
});
