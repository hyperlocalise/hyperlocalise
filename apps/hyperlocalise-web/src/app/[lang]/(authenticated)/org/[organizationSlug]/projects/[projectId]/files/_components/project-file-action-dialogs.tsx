"use client";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";

import { CreateTranslationJobDialog } from "./create-translation-job-dialog";
import { DownloadTranslationsDialog } from "./download-translations-dialog";
import { ImportTranslationsDialog } from "./import-translations-dialog";
import type { useProjectFileActions } from "./use-project-file-actions";

export function ProjectFileActionDialogs({
  file,
  actions,
}: {
  file: ProjectFileRecord;
  actions: ReturnType<typeof useProjectFileActions>;
}) {
  if (!actions.isNativeFile) {
    return null;
  }

  return (
    <>
      <CreateTranslationJobDialog
        open={actions.translateDialogOpen}
        onOpenChange={actions.setTranslateDialogOpen}
        organizationSlug={actions.organizationSlug}
        projectId={actions.projectId}
        file={file}
        sourceLocale={actions.sourceLocale}
        targetLocales={actions.stableTargetLocales}
      />
      <ImportTranslationsDialog
        open={actions.importDialogOpen}
        onOpenChange={actions.setImportDialogOpen}
        organizationSlug={actions.organizationSlug}
        projectId={actions.projectId}
        sourcePath={file.sourcePath}
        targetLocales={actions.targetLocales}
      />
      <DownloadTranslationsDialog
        open={actions.downloadDialogOpen}
        onOpenChange={actions.setDownloadDialogOpen}
        organizationSlug={actions.organizationSlug}
        projectId={actions.projectId}
        sourcePaths={actions.nativeSourcePaths}
        initialSourcePath={file.sourcePath}
        targetLocales={actions.targetLocales}
      />
    </>
  );
}
