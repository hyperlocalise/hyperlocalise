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
import type { ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { ContentEditorRepositorySelect } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/_components/content-editor-header-pickers";
import { contentEditorHeaderPickersMessages } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/_components/content-editor-header-pickers.messages";
import { ProjectFilesTree } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files-tree";
import { Button } from "@/components/ui/button";
import { CONTENT_EDITOR_ALL_FILES_SOURCE_PATH } from "@/lib/projects/content-editor-all-files";
import { cn } from "@/lib/primitives/cn";

import { contentEditorFilesSidebarMessages } from "./content-editor-files-sidebar.messages";

export function ContentEditorFilesSidebar({
  files,
  selectedSourcePath,
  onSelectFile,
  allFilesSelected = false,
  onSelectAllFiles,
  repositoryFullNames,
  selectedRepositoryFullName = null,
  onRepositoryChange,
  footer,
  className,
}: {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string) => void;
  allFilesSelected?: boolean;
  onSelectAllFiles?: () => void;
  repositoryFullNames?: readonly string[];
  selectedRepositoryFullName?: string | null;
  onRepositoryChange?: (repositoryFullName: string, destinationSourcePath: string) => void;
  footer?: ReactNode;
  className?: string;
}) {
  const intl = useIntl();
  const showRepositorySelect = Boolean(repositoryFullNames && repositoryFullNames.length > 0);

  const commitRepositorySelection = (destinationSourcePath: string) => {
    if (!onRepositoryChange || !selectedRepositoryFullName) {
      return;
    }

    onRepositoryChange(selectedRepositoryFullName, destinationSourcePath);
  };

  const handleSelectFile = (sourcePath: string) => {
    commitRepositorySelection(sourcePath);
    onSelectFile(sourcePath);
  };

  const handleSelectAllFiles = () => {
    commitRepositorySelection(CONTENT_EDITOR_ALL_FILES_SOURCE_PATH);
    onSelectAllFiles?.();
  };

  const handleRepositoryChange = (repositoryFullName: string) => {
    if (!onRepositoryChange) {
      return;
    }

    const destinationSourcePath = allFilesSelected
      ? CONTENT_EDITOR_ALL_FILES_SOURCE_PATH
      : (selectedSourcePath ?? "");
    if (!destinationSourcePath) {
      return;
    }

    onRepositoryChange(repositoryFullName, destinationSourcePath);
  };

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-r border-border bg-background",
        className,
      )}
    >
      <div className="space-y-3 border-b border-border px-3 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          <FormattedMessage {...contentEditorFilesSidebarMessages.filesTitle} />
        </h2>

        {onSelectAllFiles ? (
          <Button
            type="button"
            variant={allFilesSelected ? "default" : "outline"}
            size="sm"
            className="h-8 w-full justify-start"
            onClick={handleSelectAllFiles}
          >
            <FormattedMessage {...contentEditorHeaderPickersMessages.allFiles} />
          </Button>
        ) : null}

        {showRepositorySelect && repositoryFullNames ? (
          <ContentEditorRepositorySelect
            repositoryFullNames={repositoryFullNames}
            selectedRepositoryFullName={selectedRepositoryFullName}
            onRepositoryChange={handleRepositoryChange}
          />
        ) : null}
      </div>

      <div className="min-h-0 flex-1 px-2 py-2">
        <ProjectFilesTree
          files={files}
          selectedSourcePath={allFilesSelected ? "" : (selectedSourcePath ?? "")}
          onSelectFile={handleSelectFile}
          onActivateFile={handleSelectFile}
          ariaLabel={intl.formatMessage(contentEditorFilesSidebarMessages.sourceFilesAriaLabel)}
          fillHeight
        />
      </div>

      {footer ? <div className="border-t border-border">{footer}</div> : null}
    </aside>
  );
}

export function ContentEditorPageBody({
  sidebar,
  children,
}: {
  sidebar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {sidebar}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2 sm:px-4 lg:px-6 lg:pl-2">
        {children}
      </div>
    </div>
  );
}
