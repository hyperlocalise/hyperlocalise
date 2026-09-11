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
import { useLayoutEffect } from "react";

import { useContentEditorWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-context";

import type { ContentEditorPageChromeSnapshot } from "./content-editor-page-store";

export function ContentEditorPageChromeSync(chrome: ContentEditorPageChromeSnapshot) {
  const store = useContentEditorWorkspace();
  const {
    files,
    selectedSourcePath,
    allFiles,
    canUseAllFiles,
    targetLocale,
    targetLocales,
    repositoryFullNames,
    selectedRepositoryFullName,
    activitySourcePath,
    organizationSlug,
    projectId,
    showFileSidebar,
    showActivityLog,
  } = chrome;

  useLayoutEffect(() => {
    store.page.applyChrome({
      files,
      selectedSourcePath,
      allFiles,
      canUseAllFiles,
      targetLocale,
      targetLocales,
      repositoryFullNames,
      selectedRepositoryFullName,
      activitySourcePath,
      organizationSlug,
      projectId,
      showFileSidebar,
      showActivityLog,
    });
  }, [
    activitySourcePath,
    allFiles,
    canUseAllFiles,
    files,
    organizationSlug,
    projectId,
    repositoryFullNames,
    selectedRepositoryFullName,
    selectedSourcePath,
    showActivityLog,
    showFileSidebar,
    store,
    targetLocale,
    targetLocales,
  ]);

  return null;
}
