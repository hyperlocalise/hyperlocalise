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
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import {
  ContentEditorFileTreePicker,
  ContentEditorLocaleSelect,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/_components/content-editor-header-pickers";
import {
  ContentEditorFilesSidebar,
  ContentEditorPageBody,
} from "@/components/content-editor/files/content-editor-files-sidebar";
import { ContentEditorQueueToolbarHost } from "@/components/content-editor/queue/content-editor-queue-toolbar-host";
import type { ContentEditorWorkspaceState } from "@/components/content-editor/shared/types";
import {
  writeCatWorkspaceViewMode,
  type ContentEditorWorkspaceViewMode,
} from "@/components/content-editor/workspace/content-editor-workspace-view-mode";
import { Button } from "@/components/ui/button";

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
    <main className="flex h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <Button variant="outline" size="icon-sm" className="size-8 shrink-0" type="button">
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          </Button>

          <div className="lg:hidden">
            <ContentEditorFileTreePicker
              files={files}
              selectedSourcePath={selectedSourcePath}
              onSelectFile={setSelectedSourcePath}
            />
          </div>

          <ContentEditorLocaleSelect
            targetLocales={targetLocales}
            selectedTargetLocale={targetLocale}
            onTargetLocaleChange={setTargetLocale}
          />
        </div>

        <ContentEditorQueueToolbarHost />
      </div>

      <ContentEditorPageBody
        sidebar={
          <ContentEditorFilesSidebar
            className="hidden w-[17.5rem] shrink-0 lg:flex"
            files={files}
            selectedSourcePath={selectedSourcePath}
            onSelectFile={setSelectedSourcePath}
          />
        }
      >
        <ContentEditorWorkspaceContainer
          key={`${selectedSourcePath}:${targetLocale}:${activeEntry.initialViewMode}`}
          initialState={workspaceState}
          initialViewMode={activeEntry.initialViewMode}
          className={className ?? "min-h-0 flex-1"}
          {...workspaceProps}
        />
      </ContentEditorPageBody>
    </main>
  );
}
