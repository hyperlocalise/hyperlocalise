"use client";

import Link from "next/link";
import { forwardRef, useImperativeHandle } from "react";
import { Download01Icon, TranslateIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListIcon } from "lucide-react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";

import { ProjectFileActionDialogs } from "./project-file-action-dialogs";
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
        View strings
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
            Translate with agent
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={layout === "default" ? "w-full shrink-0 sm:w-fit" : "shrink-0"}
            onClick={() => actions.setImportDialogOpen(true)}
          >
            <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} />
            Import translations
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={layout === "default" ? "w-full shrink-0 sm:w-fit" : "shrink-0"}
            onClick={() => actions.setDownloadDialogOpen(true)}
          >
            <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
            Download
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
            {actions.canOpenCat
              ? "Open this file in the CAT workspace to review and edit translations."
              : "The CAT workspace is not available for this file yet."}
          </TypographyP>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actionButtons}</div>
      </div>
    </>
  );
});
