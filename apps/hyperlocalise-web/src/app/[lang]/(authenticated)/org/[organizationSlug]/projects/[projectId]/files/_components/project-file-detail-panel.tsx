"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type {
  ProjectFileDetailResponse,
  ProjectFileRecord,
} from "@/api/routes/project/project.schema";
import { ProjectFileCatWorkspace } from "@/components/cat/project-file-cat-workspace";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { supportsProviderCatFile } from "@/lib/providers/provider-cat-capabilities";
import { cn } from "@/lib/primitives/cn";
import { formatBytes } from "./project-files-shared";

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
) {
  return [
    formatBytes(byteSize),
    revision ? `revision ${revision}` : null,
    `Updated ${DATE_FORMATTER.format(new Date(uploadedAt))}`,
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
  const sourcePath = file?.sourcePath ?? null;

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
          throw new Error(await readApiError(response, "Failed to load file details"));
        }

        const body = (await response.json()) as ProjectFileDetailResponse;
        return body.file;
      }

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.$get({
        param: { organizationSlug, projectId },
        query: { sourcePath: sourcePath as string },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to load file details"));
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
        throw new Error(await readApiError(response, "Failed to load project"));
      }

      const body = (await response.json()) as { project: { targetLocales: string[] } };
      return body.project;
    },
  });

  return (
    <ProjectFileDetailPanelView
      organizationSlug={organizationSlug}
      projectId={projectId}
      file={file}
      requestedSourcePath={requestedSourcePath}
      highlightLocale={highlightLocale}
      targetLocales={projectQuery.data?.targetLocales ?? []}
      isLoading={detailQuery.isLoading}
      error={detailQuery.isError ? detailQuery.error : undefined}
      detail={detailQuery.data}
    />
  );
}

export function ProjectFileDetailPanelView({
  organizationSlug,
  projectId,
  file,
  requestedSourcePath,
  highlightLocale,
  targetLocales = [],
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
  isLoading: boolean;
  error?: unknown;
  detail?: ProjectFileDetail;
}) {
  const sourcePath = file?.sourcePath ?? null;

  if (!file || !sourcePath) {
    if (requestedSourcePath) {
      return (
        <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <TypographyP className="text-sm font-medium text-foreground">File not found</TypographyP>
          <TypographyP className="max-w-sm font-mono text-sm text-muted-foreground">
            {requestedSourcePath}
          </TypographyP>
          <TypographyP className="max-w-sm text-sm text-muted-foreground">
            This path is not in the project file list. It may have been removed or the link is
            outdated.
          </TypographyP>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <TypographyP className="text-sm font-medium text-foreground">Select a file</TypographyP>
        <TypographyP className="max-w-sm text-sm text-muted-foreground">
          Choose a file from the list to view metadata and edit strings in CAT.
        </TypographyP>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center gap-2 px-6 py-10">
        <Spinner />
        <TypographyP className="text-sm text-muted-foreground">Loading file…</TypographyP>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-48 flex-col justify-center gap-2 px-6 py-10">
        <TypographyP className="text-sm text-flame-100">
          {error instanceof Error ? error.message : "Failed to load file details."}
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
  const showNativeCat = Boolean(sourcePath && !file.provider);
  const showProviderCat = Boolean(sourcePath && file.provider && supportsProviderCatFile(file));
  const providerTargetLocales = provider?.targetLocales ?? [];
  const providerHighlightLocale =
    highlightLocale && providerTargetLocales.includes(highlightLocale)
      ? highlightLocale
      : (providerTargetLocales[0] ?? null);

  return (
    <div className="flex min-h-0 flex-col gap-6 px-5 py-4">
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
              Latest job · {file.latestJob.status}
            </Badge>
          ) : (
            <Badge variant="outline" className="rounded-full text-[10px]">
              Uploaded
            </Badge>
          )}
          <TypographyP className="text-xs text-muted-foreground">
            {fileMetadataLine(displayByteSize, latestVersion?.revision, file.uploadedAt)}
          </TypographyP>
        </div>
        {latestVersion?.sourceHash ? (
          <TypographyP className="font-mono text-xs text-muted-foreground">
            Hash {latestVersion.sourceHash}
          </TypographyP>
        ) : null}
        {provider ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {provider.format ? (
              <TypographyP className="text-xs text-muted-foreground">
                Format {provider.format}
              </TypographyP>
            ) : null}
            {provider.sourceLocale ? (
              <TypographyP className="text-xs text-muted-foreground">
                Source {provider.sourceLocale}
              </TypographyP>
            ) : null}
            {provider.targetLocales.length > 0 ? (
              <TypographyP className="text-xs text-muted-foreground">
                Targets {provider.targetLocales.join(", ")}
              </TypographyP>
            ) : null}
          </div>
        ) : null}
      </header>

      {showNativeCat ? (
        <section className="flex min-h-[min(32rem,70vh)] flex-col gap-3">
          <TypographyP className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            CAT workspace
          </TypographyP>
          <ProjectFileCatWorkspace
            organizationSlug={organizationSlug}
            projectId={projectId}
            sourcePath={sourcePath}
            targetLocales={targetLocales}
            highlightLocale={highlightLocale}
            layout="default"
            className="min-h-[min(28rem,60vh)]"
          />
        </section>
      ) : null}

      {showProviderCat && providerHighlightLocale ? (
        <section className="flex min-h-[min(32rem,70vh)] flex-col gap-3">
          <TypographyP className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            CAT workspace
          </TypographyP>
          <ProjectFileCatWorkspace
            organizationSlug={organizationSlug}
            projectId={projectId}
            sourcePath={sourcePath}
            targetLocale={providerHighlightLocale}
            highlightLocale={highlightLocale}
            layout="default"
            className="min-h-[min(28rem,60vh)]"
          />
        </section>
      ) : null}

      {orderedJobsByLocale.length > 0 ? (
        <section className="space-y-3">
          <TypographyP className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Jobs by locale
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
