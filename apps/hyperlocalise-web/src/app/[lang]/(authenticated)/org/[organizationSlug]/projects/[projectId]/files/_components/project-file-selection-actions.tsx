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

import { ImportTranslationsDialog } from "./import-translations-dialog";

function downloadTranslation(
  organizationSlug: string,
  projectId: string,
  sourcePath: string,
  locale: string,
) {
  const params = new URLSearchParams({ sourcePath, locale });
  const href = `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/files/translations/download?${params.toString()}`;
  window.open(href, "_blank", "noopener,noreferrer");
}

export function ProjectFileSelectionActions({
  organizationSlug,
  projectId,
  file,
  highlightLocale,
  projectTargetLocales,
  branch = null,
  layout = "default",
}: {
  organizationSlug: string;
  projectId: string;
  file: ProjectFileRecord;
  highlightLocale: string | null;
  projectTargetLocales?: readonly string[] | null;
  branch?: string | null;
  layout?: "default" | "compact";
}) {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const canOpenCat = canOpenProjectFileCat(file);
  const isNativeFile = !file.provider;
  const targetLocales = projectTargetLocales ?? [];
  const catHref = buildProjectFileCatHref(
    organizationSlug,
    projectId,
    file,
    highlightLocale,
    branch,
    projectTargetLocales,
  );

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
          {targetLocales.map((locale) => (
            <Button
              key={locale}
              type="button"
              size="sm"
              variant="outline"
              className={layout === "default" ? "w-full shrink-0 sm:w-fit" : "shrink-0"}
              onClick={() =>
                downloadTranslation(organizationSlug, projectId, file.sourcePath, locale)
              }
            >
              <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
              Download {locale}
            </Button>
          ))}
        </>
      ) : null}
    </>
  );

  if (layout === "compact") {
    return (
      <>
        {isNativeFile ? (
          <ImportTranslationsDialog
            open={importDialogOpen}
            onOpenChange={setImportDialogOpen}
            organizationSlug={organizationSlug}
            projectId={projectId}
            sourcePath={file.sourcePath}
            targetLocales={[...targetLocales]}
          />
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2">{actionButtons}</div>
      </>
    );
  }

  return (
    <>
      {isNativeFile ? (
        <ImportTranslationsDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          organizationSlug={organizationSlug}
          projectId={projectId}
          sourcePath={file.sourcePath}
          targetLocales={[...targetLocales]}
        />
      ) : null}
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
