"use client";

import Link from "next/link";
import { useState } from "react";
import { Download01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListIcon } from "lucide-react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";
import {
  buildProjectFileCatHref,
  canOpenProjectFileCat,
} from "@/lib/projects/project-file-cat-routing";

import { DownloadTranslationsDialog } from "./download-translations-dialog";
import { ImportTranslationsDialog } from "./import-translations-dialog";

const EMPTY_STRING_ARRAY: readonly string[] = [];

export function ProjectFileSelectionActions({
  organizationSlug,
  projectId,
  file,
  highlightLocale,
  projectTargetLocales,
  nativeSourcePaths = EMPTY_STRING_ARRAY,
  branch = null,
  layout = "default",
}: {
  organizationSlug: string;
  projectId: string;
  file: ProjectFileRecord;
  highlightLocale: string | null;
  projectTargetLocales?: readonly string[] | null;
  nativeSourcePaths?: readonly string[];
  branch?: string | null;
  layout?: "default" | "compact";
}) {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const canOpenCat = canOpenProjectFileCat(file);
  const isNativeFile = !file.provider;
  const targetLocales = projectTargetLocales ?? EMPTY_STRING_ARRAY;
  const catHref = buildProjectFileCatHref(
    organizationSlug,
    projectId,
    file,
    highlightLocale,
    branch,
    projectTargetLocales,
  );

  const nativeDialogs = isNativeFile ? (
    <>
      <ImportTranslationsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        organizationSlug={organizationSlug}
        projectId={projectId}
        sourcePath={file.sourcePath}
        targetLocales={targetLocales}
      />
      <DownloadTranslationsDialog
        open={downloadDialogOpen}
        onOpenChange={setDownloadDialogOpen}
        organizationSlug={organizationSlug}
        projectId={projectId}
        sourcePaths={nativeSourcePaths}
        initialSourcePath={file.sourcePath}
        targetLocales={targetLocales}
      />
    </>
  ) : null;

  const actionButtons = (
    <>
      <Button
        type="button"
        size="sm"
        className={layout === "default" ? "w-full shrink-0 sm:w-fit" : "shrink-0"}
        disabled={!canOpenCat || !catHref}
        render={canOpenCat && catHref ? <Link href={catHref} /> : undefined}
      >
        <ListIcon />
        View strings
      </Button>
      {isNativeFile ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={layout === "default" ? "w-full shrink-0 sm:w-fit" : "shrink-0"}
            onClick={() => setImportDialogOpen(true)}
          >
            <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} />
            Import translations
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={layout === "default" ? "w-full shrink-0 sm:w-fit" : "shrink-0"}
            onClick={() => setDownloadDialogOpen(true)}
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
        {nativeDialogs}
        <div className="flex flex-wrap items-center justify-end gap-2">{actionButtons}</div>
      </>
    );
  }

  return (
    <>
      {nativeDialogs}
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <TypographyP className="truncate font-mono text-sm text-foreground">
            {file.sourcePath}
          </TypographyP>
          <TypographyP className="text-xs text-muted-foreground">
            {canOpenCat
              ? "Open this file in the CAT workspace to review and edit translations."
              : "The CAT workspace is not available for this file yet."}
          </TypographyP>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actionButtons}</div>
      </div>
    </>
  );
}
