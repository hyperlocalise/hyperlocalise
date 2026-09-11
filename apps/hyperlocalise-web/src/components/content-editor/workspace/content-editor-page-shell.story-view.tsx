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
import { useEffect, useMemo, useState, type ComponentProps } from "react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { ContentEditorPageRoot } from "@/components/content-editor/page/content-editor-page-root";
import type { ContentEditorWorkspaceState } from "@/components/content-editor/shared/types";
import {
  writeCatWorkspaceViewMode,
  type ContentEditorWorkspaceViewMode,
} from "@/components/content-editor/workspace/content-editor-workspace-view-mode";

import { ContentEditorWorkspaceContainer } from "./content-editor-workspace-container";

type ContentEditorPageShellWorkspaceEntry = {
  state: ContentEditorWorkspaceState;
  initialViewMode: ContentEditorWorkspaceViewMode;
};

type ContentEditorPageShellStoryViewProps = {
  files: ProjectFileRecord[];
  initialSelectedSourcePath: string;
  workspaceBySourcePath: Record<string, ContentEditorPageShellWorkspaceEntry>;
  targetLocales?: string[];
} & Omit<
  ComponentProps<typeof ContentEditorWorkspaceContainer>,
  "initialState" | "initialViewMode"
>;

export function ContentEditorPageShellStoryView({
  files,
  initialSelectedSourcePath,
  workspaceBySourcePath,
  targetLocales = ["vi", "fr-FR"],
  className,
  ...workspaceProps
}: ContentEditorPageShellStoryViewProps) {
  const [selectedSourcePath, setSelectedSourcePath] = useState(initialSelectedSourcePath);
  const fallbackEntry =
    workspaceBySourcePath[initialSelectedSourcePath] ?? Object.values(workspaceBySourcePath)[0];
  if (!fallbackEntry) {
    throw new Error("ContentEditorPageShellStoryView requires at least one workspace entry.");
  }

  const activeEntry = workspaceBySourcePath[selectedSourcePath] ?? fallbackEntry;
  const [targetLocale, setTargetLocale] = useState(
    activeEntry.state.fileContext.targetLocale ?? targetLocales[0] ?? "vi",
  );

  useEffect(() => {
    writeCatWorkspaceViewMode(activeEntry.initialViewMode);
  }, [activeEntry.initialViewMode, selectedSourcePath]);

  const workspaceState = useMemo(
    () => ({
      ...activeEntry.state,
      fileContext: {
        ...activeEntry.state.fileContext,
        sourcePath: selectedSourcePath,
        filename:
          files.find((file) => file.sourcePath === selectedSourcePath)?.filename ??
          activeEntry.state.fileContext.filename,
        targetLocale,
      },
    }),
    [activeEntry.state, files, selectedSourcePath, targetLocale],
  );

  return (
    <ContentEditorPageRoot
      initialState={workspaceState}
      chrome={{
        files,
        selectedSourcePath,
        allFiles: false,
        canUseAllFiles: false,
        targetLocale,
        targetLocales,
        repositoryFullNames: [],
        selectedRepositoryFullName: null,
        activitySourcePath: selectedSourcePath,
        organizationSlug: "story",
        projectId: "story",
        showFileSidebar: true,
        showActivityLog: false,
      }}
      backHref="#"
      actions={{
        onSelectFile: setSelectedSourcePath,
        onLocaleChange: setTargetLocale,
      }}
      className="mx-0 my-0 h-svh sm:mx-0 lg:mx-0"
    >
      <ContentEditorWorkspaceContainer
        initialState={workspaceState}
        queueSnapshot={workspaceState}
        fileScopeKey={`${selectedSourcePath}:${targetLocale}:${activeEntry.initialViewMode}`}
        initialViewMode={activeEntry.initialViewMode}
        className={className ?? "min-h-0 flex-1"}
        {...workspaceProps}
      />
    </ContentEditorPageRoot>
  );
}
