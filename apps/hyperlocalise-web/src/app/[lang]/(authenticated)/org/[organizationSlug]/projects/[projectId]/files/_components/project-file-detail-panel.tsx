"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download01Icon, TranslateIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import type {
  ProjectFileDetailResponse,
  ProjectFileRecord,
} from "@/api/routes/project/project.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";
import { formatBytes } from "./project-files-shared";
import { projectFileDetailPanelMessages as messages } from "./project-file-detail-panel.messages";
import { CreateTranslationJobDialog } from "./create-translation-job-dialog";
import { ImportTranslationsDialog } from "./import-translations-dialog";
import {
  resolveFileLocaleReadiness,
  summarizeNativeLocaleReadiness,
} from "@/lib/projects/files/native-locale-readiness";

type ProjectFileDetail = ProjectFileDetailResponse["file"];

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function projectFileDetailQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath: string,
  encodedJobId?: string | null,
) {
  return encodedJobId
    ? (["tms-provider-job-file-detail", organizationSlug, encodedJobId, sourcePath] as const)
    : (["project-file-detail", organizationSlug, projectId, sourcePath] as const);
}

function providerName(kind: string) {
  switch (kind) {
    case "crowdin":
      return "Crowdin";
    case "phrase":
      return "Phrase";
    case "lokalise":
      return "Lokalise";
    case "smartling":
      return "Smartling";
    default:
      return kind;
  }
}

function fileMetadataLine(
  byteSize: number | null,
  revision: string | null | undefined,
  uploadedAt: string,
  intl: IntlShape,
) {
  return [
    formatBytes(byteSize, intl),
    revision ? intl.formatMessage(messages.revision, { revision }) : null,
    intl.formatMessage(messages.updatedAt, {
      date: DATE_FORMATTER.format(new Date(uploadedAt)),
    }),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ProjectFileDetailPanel({
  organizationSlug,
  projectId,
  file,
  requestedSourcePath,
  highlightLocale,
  encodedJobId,
}: {
  organizationSlug: string;
  projectId: string;
  file: ProjectFileRecord | null;
  requestedSourcePath: string | null;
  highlightLocale: string | null;
  encodedJobId?: string | null;
}) {
  const intl = useIntl();
  const sourcePath = file?.sourcePath ?? null;
  const externalResourceId = file?.provider?.externalResourceId ?? null;
  const loadDetailsFailed = intl.formatMessage(messages.loadDetailsFailedShort);
  const loadProjectFailed = intl.formatMessage(messages.loadProjectFailed);

  const detailQuery = useQuery({
    queryKey: projectFileDetailQueryKey(
      organizationSlug,
      projectId,
      sourcePath ?? "",
      encodedJobId,
    ),
    enabled: Boolean(sourcePath),
    queryFn: async () => {
      if (encodedJobId) {
        const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
          ":encodedJobId"
        ].files.detail.$get({
          param: { organizationSlug, encodedJobId },
          query: { sourcePath: sourcePath as string },
        });

        if (!response.ok) {
          throw new Error(await readApiError(response, loadDetailsFailed));
        }

        const body = (await response.json()) as ProjectFileDetailResponse;
        return body.file;
      }

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.$get({
        param: { organizationSlug, projectId },
        query: {
          sourcePath: sourcePath as string,
          ...(externalResourceId ? { externalResourceId } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, loadDetailsFailed));
      }

      const body = (await response.json()) as ProjectFileDetailResponse;
      return body.file;
    },
  });

  const projectQuery = useQuery({
    queryKey: ["project", organizationSlug, projectId],
    enabled: Boolean(file && !file.provider && !encodedJobId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].$get({
        param: { organizationSlug, projectId },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, loadProjectFailed));
      }

      const body = (await response.json()) as {
        project: { targetLocales: string[]; sourceLocale: string | null };
      };
      return body.project;
    },
  });

  return (
    <>
      <ProjectFileDetailPanelView
        organizationSlug={organizationSlug}
        projectId={projectId}
        file={file}
        requestedSourcePath={requestedSourcePath}
        highlightLocale={highlightLocale}
        targetLocales={projectQuery.data?.targetLocales ?? []}
        sourceLocale={projectQuery.data?.sourceLocale ?? "en"}
        isLoading={detailQuery.isLoading}
        error={detailQuery.isError ? detailQuery.error : undefined}
        detail={detailQuery.data}
      />
    </>
  );
}

export function ProjectFileDetailPanelView({
  organizationSlug,
  projectId,
  file,
  requestedSourcePath,
  highlightLocale,
  targetLocales = [],
  sourceLocale = "en",
  isLoading,
  error,
  detail,
}: {
  organizationSlug: string;
  projectId: string;
  file: ProjectFileRecord | null;
  requestedSourcePath: string | null;
  highlightLocale: string | null;
  targetLocales?: string[];
  sourceLocale?: string;
  isLoading: boolean;
  error?: unknown;
  detail?: ProjectFileDetail;
}) {
  const intl = useIntl();
  const [translateDialogOpen, setTranslateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const sourcePath = file?.sourcePath ?? null;

  if (!file || !sourcePath) {
    if (requestedSourcePath) {
      return (
        <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <TypographyP className="text-sm font-medium text-foreground">
            <FormattedMessage {...messages.fileNotFound} />
          </TypographyP>
          <TypographyP className="max-w-sm font-mono text-sm text-muted-foreground">
            {requestedSourcePath}
          </TypographyP>
          <TypographyP className="max-w-sm text-sm text-muted-foreground">
            <FormattedMessage {...messages.fileNotFoundDescription} />
          </TypographyP>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <TypographyP className="text-sm font-medium text-foreground">
          <FormattedMessage {...messages.selectFile} />
        </TypographyP>
        <TypographyP className="max-w-sm text-sm text-muted-foreground">
          <FormattedMessage {...messages.selectFileDescription} />
        </TypographyP>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center gap-2 px-6 py-10">
        <Spinner />
        <TypographyP className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.loadingFile} />
        </TypographyP>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-48 flex-col justify-center gap-2 px-6 py-10">
        <TypographyP className="text-sm text-flame-100">
          {error instanceof Error ? error.message : intl.formatMessage(messages.loadDetailsFailed)}
        </TypographyP>
      </div>
    );
  }

  const latestVersion = detail?.versions[0];
  const displayByteSize = latestVersion?.byteSize ?? file.byteSize;
  const provider = file.provider;

  const jobsByLocale = detail?.jobsByLocale ?? [];
  const orderedJobsByLocale = highlightLocale
    ? [
        ...jobsByLocale.filter((group) => group.locale === highlightLocale),
        ...jobsByLocale.filter((group) => group.locale !== highlightLocale),
      ]
    : jobsByLocale;
  const localeReadiness = resolveFileLocaleReadiness(file);
  const readinessSummary = summarizeNativeLocaleReadiness(localeReadiness, targetLocales.length);
  const downloadableLocales = targetLocales;

  function downloadTranslation(locale: string) {
    if (!sourcePath) return;
    const params = new URLSearchParams({ sourcePath, locale });
    const href = `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/files/translations/download?${params.toString()}`;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex min-h-0 flex-col gap-6 px-5 py-4">
      <CreateTranslationJobDialog
        open={translateDialogOpen}
        onOpenChange={setTranslateDialogOpen}
        organizationSlug={organizationSlug}
        projectId={projectId}
        file={file}
        sourceLocale={sourceLocale}
        targetLocales={targetLocales}
      />
      {!provider ? (
        <ImportTranslationsDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          organizationSlug={organizationSlug}
          projectId={projectId}
          sourcePath={sourcePath}
          targetLocales={targetLocales}
        />
      ) : null}
      <header className="space-y-2 border-b border-border pb-4">
        <TypographyP className="font-mono text-sm font-medium text-foreground">
          {sourcePath}
        </TypographyP>
        <div className="flex flex-wrap items-center gap-2">
          {provider ? (
            <Badge variant="outline" className="rounded-full text-[10px]">
              {providerName(provider.kind)}
            </Badge>
          ) : file.latestJob ? (
            <Badge variant="outline" className="rounded-full text-[10px]">
              <FormattedMessage
                {...messages.latestJob}
                values={{ status: file.latestJob.status }}
              />
            </Badge>
          ) : (
            <Badge variant="outline" className="rounded-full text-[10px]">
              <FormattedMessage {...messages.uploaded} />
            </Badge>
          )}
          <TypographyP className="text-xs text-muted-foreground">
            {fileMetadataLine(displayByteSize, latestVersion?.revision, file.uploadedAt, intl)}
          </TypographyP>
        </div>
        {latestVersion?.sourceHash ? (
          <TypographyP className="font-mono text-xs text-muted-foreground">
            <FormattedMessage {...messages.hash} values={{ hash: latestVersion.sourceHash }} />
          </TypographyP>
        ) : null}
        {provider ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {provider.format ? (
              <TypographyP className="text-xs text-muted-foreground">
                <FormattedMessage {...messages.format} values={{ format: provider.format }} />
              </TypographyP>
            ) : null}
            {provider.sourceLocale ? (
              <TypographyP className="text-xs text-muted-foreground">
                <FormattedMessage
                  {...messages.sourceLocale}
                  values={{ locale: provider.sourceLocale }}
                />
              </TypographyP>
            ) : null}
            {provider.targetLocales.length > 0 ? (
              <TypographyP className="text-xs text-muted-foreground">
                <FormattedMessage
                  {...messages.targets}
                  values={{ locales: provider.targetLocales.join(", ") }}
                />
              </TypographyP>
            ) : null}
          </div>
        ) : null}
        {!provider && readinessSummary ? (
          <TypographyP className="text-xs text-muted-foreground">{readinessSummary}</TypographyP>
        ) : null}
        {!provider ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" onClick={() => setTranslateDialogOpen(true)}>
              <HugeiconsIcon icon={TranslateIcon} strokeWidth={1.8} />
              <FormattedMessage {...messages.translateWithAgent} />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
            >
              <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} />
              <FormattedMessage {...messages.importTranslations} />
            </Button>
            {downloadableLocales.length > 0
              ? downloadableLocales.map((locale) => (
                  <Button
                    key={locale}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => downloadTranslation(locale)}
                  >
                    <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
                    <FormattedMessage {...messages.downloadLocale} values={{ locale }} />
                  </Button>
                ))
              : null}
          </div>
        ) : null}
      </header>

      {orderedJobsByLocale.length > 0 ? (
        <section className="space-y-3">
          <TypographyP className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <FormattedMessage {...messages.jobsByLocale} />
          </TypographyP>
          <div className="flex flex-col gap-3">
            {orderedJobsByLocale.map((group) => (
              <div
                key={group.locale}
                className={cn(
                  "rounded-md border border-border bg-background p-3",
                  highlightLocale === group.locale && "border-primary bg-muted",
                )}
              >
                <TypographyP className="mb-2 text-sm font-medium text-foreground">
                  {group.locale}
                </TypographyP>
                <ul className="flex flex-col gap-1.5">
                  {group.jobs.map((job) => (
                    <li key={job.id}>
                      <Link
                        href={`/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(job.id)}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                      >
                        <span className="font-mono text-xs text-foreground">{job.id}</span>
                        <Badge variant="outline" className="rounded-full text-[10px]">
                          {job.status}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
