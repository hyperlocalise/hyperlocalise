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
import Link from "next/link";
import { observer } from "mobx-react-lite";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  ContentEditorFileTreePicker,
  ContentEditorLocaleSelect,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/_components/content-editor-header-pickers";
import { ContentEditorActivityLogButton } from "@/components/content-editor/activity-log/content-editor-activity-log-dialog";
import { ContentEditorQueueToolbarHost } from "@/components/content-editor/queue/content-editor-queue-toolbar-host";
import { useContentEditorWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-context";
import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";

import type { ContentEditorPageActions } from "./content-editor-page-shell";

export const ContentEditorPageHeader = observer(function ContentEditorPageHeader({
  backHref,
  actions,
}: {
  backHref: string;
  actions: ContentEditorPageActions;
}) {
  const page = useContentEditorWorkspace().page;
  const showFilePicker = page.files.length > 0 || page.allFiles;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4 lg:px-6">
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          className="size-8 shrink-0"
          render={<Link href={backHref} />}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
        </Button>

        {showFilePicker ? (
          <div className="lg:hidden">
            <ContentEditorFileTreePicker
              files={page.files}
              selectedSourcePath={page.selectedSourcePath ?? ""}
              onSelectFile={actions.onSelectFile}
              allFilesSelected={page.allFiles}
              onSelectAllFiles={page.canUseAllFiles ? actions.onSelectAllFiles : undefined}
              repositoryFullNames={page.repositoryFullNames}
              selectedRepositoryFullName={page.selectedRepositoryFullName}
              onRepositoryChange={actions.onRepositoryChange}
            />
          </div>
        ) : page.selectedSourcePath ? (
          <TypographyP className="max-w-44 font-mono" lineClamp={1} size="xsmall" tone="subtle">
            {page.selectedSourcePath}
          </TypographyP>
        ) : null}

        {page.targetLocales.length > 0 ? (
          <ContentEditorLocaleSelect
            targetLocales={page.targetLocales}
            selectedTargetLocale={page.targetLocale}
            onTargetLocaleChange={actions.onLocaleChange}
          />
        ) : null}

        {page.showActivityLog &&
        page.organizationSlug &&
        page.projectId &&
        page.activitySourcePath ? (
          <ContentEditorActivityLogButton
            organizationSlug={page.organizationSlug}
            projectId={page.projectId}
            sourcePath={page.activitySourcePath}
          />
        ) : null}
      </div>

      <ContentEditorQueueToolbarHost />
    </div>
  );
});
