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
import { LeftToRightListBulletIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH4, TypographyP } from "@/components/ui/typography";
import { supportsProviderContentEditorFile } from "@/lib/providers/capabilities/provider-content-editor-capabilities";
import { jobContentEditorQueueFilterParam } from "@/lib/projects/job-content-editor-routing";
import type { ContentEditorQueueFilter } from "@/components/content-editor/queue/content-editor-queue-filter";

import { ProjectFilesTree } from "../../../../files/_components/project-files-tree";
import { jobSourceFilesPanelMessages as messages } from "./job-source-files-panel.messages";

function sortFilesByPath(files: ProjectFileRecord[]) {
  return [...files].toSorted((a, b) =>
    a.sourcePath.localeCompare(b.sourcePath, undefined, { sensitivity: "base" }),
  );
}

function stringsHref(input: {
  organizationSlug: string;
  projectId: string;
  encodedJobId: string;
  targetLocale: string;
  sourcePath?: string;
  storedFileId?: string;
  queueFilter?: ContentEditorQueueFilter;
}) {
  const params = new URLSearchParams({
    targetLocale: input.targetLocale,
  });

  if (input.sourcePath) {
    params.set("sourcePath", input.sourcePath);
  }

  if (input.storedFileId) {
    params.set("storedFileId", input.storedFileId);
  }

  if (input.queueFilter && input.queueFilter !== "all") {
    params.set(jobContentEditorQueueFilterParam, input.queueFilter);
  }

  return `/org/${input.organizationSlug}/projects/${encodeURIComponent(input.projectId)}/jobs/${encodeURIComponent(input.encodedJobId)}/strings?${params.toString()}`;
}

function resolveTargetLocale(file: ProjectFileRecord, highlightLocale: string | null) {
  if (file.provider) {
    if (highlightLocale && file.provider.targetLocales?.includes(highlightLocale)) {
      return highlightLocale;
    }

    return file.provider.targetLocales?.[0] ?? highlightLocale;
  }

  return highlightLocale;
}

function canOpenFileInCat(
  file: ProjectFileRecord,
  sourcePath: string,
  encodedJobId: string | null | undefined,
  targetLocale: string | null,
) {
  if (!encodedJobId || !targetLocale) {
    return false;
  }

  const isProviderContentEditorFile = supportsProviderContentEditorFile(file);
  const isNativeContentEditorFile = !file.provider && Boolean(file.storedFileId);

  if (isProviderContentEditorFile) {
    return Boolean(sourcePath);
  }

  return isNativeContentEditorFile;
}

function contentEditorOpenUnavailableMessage(targetLocale: string | null, intl: IntlShape) {
  if (!targetLocale) {
    return intl.formatMessage(messages.noTargetLocaleForTaskFile);
  }

  return intl.formatMessage(messages.fileCantOpenInContentEditor);
}

export function JobSourceFilesPanel({
  organizationSlug,
  projectId,
  encodedJobId,
  files,
  isLoading,
  isError,
  errorMessage,
  emptyMessage,
  highlightLocale = null,
  queueFilter,
}: {
  organizationSlug: string;
  projectId: string;
  encodedJobId?: string | null;
  files: ProjectFileRecord[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  emptyMessage?: string;
  highlightLocale?: string | null;
  queueFilter?: ContentEditorQueueFilter;
}) {
  const intl = useIntl();
  const resolvedEmptyMessage = emptyMessage ?? intl.formatMessage(messages.defaultEmptyMessage);
  const router = useRouter();
  const sortedFiles = useMemo(() => sortFilesByPath(files), [files]);
  const [selectedSourcePath, setSelectedSourcePath] = useState<string | null>(null);
  const selectedFile =
    sortedFiles.find((file) => file.sourcePath === selectedSourcePath) ?? sortedFiles[0] ?? null;
  const activeSourcePath = selectedFile?.sourcePath ?? null;

  const openFileInCat = useCallback(
    (sourcePath: string) => {
      if (!encodedJobId) {
        return;
      }

      const file = sortedFiles.find((entry) => entry.sourcePath === sourcePath);
      if (!file) {
        return;
      }

      const targetLocale = resolveTargetLocale(file, highlightLocale);
      if (!canOpenFileInCat(file, sourcePath, encodedJobId, targetLocale)) {
        toast.error(contentEditorOpenUnavailableMessage(targetLocale, intl));
        return;
      }

      router.push(
        stringsHref({
          organizationSlug,
          projectId,
          encodedJobId,
          targetLocale: targetLocale as string,
          queueFilter,
          ...(supportsProviderContentEditorFile(file)
            ? { sourcePath }
            : { storedFileId: file.storedFileId as string }),
        }),
      );
    },
    [
      encodedJobId,
      highlightLocale,
      intl,
      organizationSlug,
      projectId,
      queueFilter,
      router,
      sortedFiles,
    ],
  );

  const handleSelectFile = useCallback((sourcePath: string) => {
    setSelectedSourcePath(sourcePath);
  }, []);

  const selectedTargetLocale = selectedFile
    ? resolveTargetLocale(selectedFile, highlightLocale)
    : null;
  const canViewStrings = Boolean(
    selectedFile &&
    activeSourcePath &&
    canOpenFileInCat(selectedFile, activeSourcePath, encodedJobId, selectedTargetLocale),
  );
  const stringsHrefForSelected =
    canViewStrings && selectedFile && activeSourcePath && encodedJobId && selectedTargetLocale
      ? stringsHref({
          organizationSlug,
          projectId,
          encodedJobId,
          targetLocale: selectedTargetLocale,
          queueFilter,
          ...(supportsProviderContentEditorFile(selectedFile)
            ? { sourcePath: activeSourcePath }
            : { storedFileId: selectedFile.storedFileId as string }),
        })
      : null;

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <TypographyH4>
        <FormattedMessage {...messages.sourceFilesHeading} />
      </TypographyH4>

      {isLoading ? (
        <div className="mt-4">
          <Skeleton className="h-80 w-full" />
        </div>
      ) : null}

      {isError ? (
        <p className="mt-4 text-sm text-flame-100">
          {errorMessage ?? intl.formatMessage(messages.unableToLoadSourceFiles)}
        </p>
      ) : null}

      {!isLoading && !isError && sortedFiles.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{resolvedEmptyMessage}</p>
      ) : null}

      {!isLoading && !isError && sortedFiles.length > 0 ? (
        <div className="mt-4 space-y-2">
          {encodedJobId ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <TypographyP className="truncate font-mono text-xs text-foreground">
                  {selectedFile?.sourcePath}
                </TypographyP>
                <TypographyP className="text-xs text-muted-foreground">
                  {selectedTargetLocale ? (
                    <FormattedMessage
                      {...messages.contentEditorWorkspaceHintWithLocale}
                      values={{ targetLocale: selectedTargetLocale }}
                    />
                  ) : (
                    <FormattedMessage {...messages.noTargetLocaleForTaskFile} />
                  )}
                </TypographyP>
              </div>
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                disabled={!stringsHrefForSelected}
                render={stringsHrefForSelected ? <Link href={stringsHrefForSelected} /> : undefined}
              >
                <HugeiconsIcon icon={LeftToRightListBulletIcon} />
                <FormattedMessage {...messages.openEditor} />
              </Button>
            </div>
          ) : null}
          <div className="overflow-hidden rounded-lg border border-border bg-background p-2">
            <ProjectFilesTree
              ariaLabel={intl.formatMessage(messages.jobSourceFilesAriaLabel)}
              files={sortedFiles}
              selectedSourcePath={activeSourcePath}
              onSelectFile={handleSelectFile}
              onActivateFile={encodedJobId ? openFileInCat : undefined}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
