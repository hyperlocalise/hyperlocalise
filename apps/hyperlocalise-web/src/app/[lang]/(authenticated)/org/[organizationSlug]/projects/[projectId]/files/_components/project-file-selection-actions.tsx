"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import Link from "next/link";
import { forwardRef, useImperativeHandle } from "react";
import { Download01Icon, TranslateIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListIcon } from "lucide-react";
import { FormattedMessage } from "react-intl";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";

import { ProjectFileActionDialogs } from "./project-file-action-dialogs";
import { projectFileSelectionActionsMessages as messages } from "./project-file-selection-actions.messages";
import { useProjectFileActions } from "./use-project-file-actions";

const EMPTY_STRING_ARRAY: readonly string[] = [];

export type ProjectFileSelectionActionsHandle = {
  openTranslate: () => void;
  openImport: () => void;
  openDownload: () => void;
};

export const ProjectFileSelectionActions = forwardRef<
  ProjectFileSelectionActionsHandle,
  {
    organizationSlug: string;
    projectId: string;
    file: ProjectFileRecord;
    highlightLocale: string | null;
    projectTargetLocales?: readonly string[] | null;
    sourceLocale?: string;
    nativeSourcePaths?: readonly string[];
    branch?: string | null;
    layout?: "default" | "compact";
  }
>(function ProjectFileSelectionActions(
  {
    organizationSlug,
    projectId,
    file,
    highlightLocale,
    projectTargetLocales,
    sourceLocale = "en",
    nativeSourcePaths = EMPTY_STRING_ARRAY,
    branch = null,
    layout = "default",
  },
  ref,
) {
  const actions = useProjectFileActions({
    organizationSlug,
    projectId,
    file,
    highlightLocale,
    projectTargetLocales,
    sourceLocale,
    nativeSourcePaths,
    branch,
  });

  useImperativeHandle(
    ref,
    () => ({
      openTranslate: () => actions.setTranslateDialogOpen(true),
      openImport: () => actions.setImportDialogOpen(true),
      openDownload: () => actions.setDownloadDialogOpen(true),
    }),
    [actions.setDownloadDialogOpen, actions.setImportDialogOpen, actions.setTranslateDialogOpen],
  );

  const actionButtons = (
    <>
      <Button
        type="button"
        size="sm"
        className={layout === "default" ? "w-full shrink-0 sm:w-fit" : "shrink-0"}
        disabled={!actions.canOpenCat || !actions.catHref}
        render={actions.canOpenCat && actions.catHref ? <Link href={actions.catHref} /> : undefined}
      >
        <ListIcon />
        <FormattedMessage {...messages.viewStrings} />
      </Button>
      {actions.isNativeFile ? (
        <>
          <Button
            type="button"
            size="sm"
            className={layout === "default" ? "w-full shrink-0 sm:w-fit" : "shrink-0"}
            disabled={!actions.canTranslateWithAgent}
            title={actions.translateDisabledTitle}
            onClick={() => actions.setTranslateDialogOpen(true)}
          >
            <HugeiconsIcon icon={TranslateIcon} strokeWidth={1.8} />
            <FormattedMessage {...messages.translateWithAgent} />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={layout === "default" ? "w-full shrink-0 sm:w-fit" : "shrink-0"}
            onClick={() => actions.setImportDialogOpen(true)}
          >
            <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} />
            <FormattedMessage {...messages.importTranslations} />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={layout === "default" ? "w-full shrink-0 sm:w-fit" : "shrink-0"}
            onClick={() => actions.setDownloadDialogOpen(true)}
          >
            <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
            <FormattedMessage {...messages.download} />
          </Button>
        </>
      ) : null}
    </>
  );

  if (layout === "compact") {
    return (
      <>
        <ProjectFileActionDialogs file={file} actions={actions} />
        <div className="flex flex-wrap items-center justify-end gap-2">{actionButtons}</div>
      </>
    );
  }

  return (
    <>
      <ProjectFileActionDialogs file={file} actions={actions} />
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <TypographyP className="truncate font-mono text-sm text-foreground">
            {file.sourcePath}
          </TypographyP>
          <TypographyP className="text-xs text-muted-foreground">
            {actions.canOpenCat ? (
              <FormattedMessage {...messages.catAvailableHint} />
            ) : (
              <FormattedMessage {...messages.catUnavailableHint} />
            )}
          </TypographyP>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actionButtons}</div>
      </div>
    </>
  );
});
