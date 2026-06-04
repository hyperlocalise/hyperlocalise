"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type {
  ProjectFileDetailResponse,
  ProjectFileRecord,
} from "@/api/routes/project/project.schema";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { ProjectFileSourceStringsPreview } from "./project-file-source-strings-preview";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { parseSourceStringsFromFileContent } from "@/lib/projects/project-file-source-strings";
import { cn } from "@/lib/primitives/cn";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const MAX_PREVIEW_CHARS = 100_000;

function projectFileDetailQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath: string,
) {
  return ["project-file-detail", organizationSlug, projectId, sourcePath] as const;
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "Unknown size";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Number((bytes / 1024 ** unitIndex).toFixed(1))} ${units[unitIndex]}`;
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

function truncatePreview(text: string) {
  if (text.length <= MAX_PREVIEW_CHARS) {
    return { text, truncated: false };
  }

  return {
    text: `${text.slice(0, MAX_PREVIEW_CHARS)}\n\n…`,
    truncated: true,
  };
}

export function ProjectFileDetailPanel({
  organizationSlug,
  projectId,
  file,
  requestedSourcePath,
  highlightLocale,
  canFindInRepo,
}: {
  organizationSlug: string;
  projectId: string;
  file: ProjectFileRecord | null;
  requestedSourcePath: string | null;
  highlightLocale: string | null;
  canFindInRepo: boolean;
}) {
  const sourcePath = file?.sourcePath ?? null;

  const detailQuery = useQuery({
    queryKey: projectFileDetailQueryKey(organizationSlug, projectId, sourcePath ?? ""),
    enabled: Boolean(sourcePath),
    queryFn: async () => {
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

  if (!file || !sourcePath) {
    if (requestedSourcePath) {
      return (
        <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <TypographyP className="text-sm font-medium text-foreground">File not found</TypographyP>
          <TypographyP className="max-w-sm font-mono text-sm text-foreground/52">
            {requestedSourcePath}
          </TypographyP>
          <TypographyP className="max-w-sm text-sm text-foreground/52">
            This path is not in the project file list. It may have been removed or the link is
            outdated.
          </TypographyP>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <TypographyP className="text-sm font-medium text-foreground">Select a file</TypographyP>
        <TypographyP className="max-w-sm text-sm text-foreground/52">
          Choose a file from the list to preview its source content and related jobs.
        </TypographyP>
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center gap-2 px-6 py-10">
        <Spinner />
        <TypographyP className="text-sm text-foreground/52">Loading file…</TypographyP>
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="flex h-full min-h-48 flex-col justify-center gap-2 px-6 py-10">
        <TypographyP className="text-sm text-flame-100">
          {detailQuery.error instanceof Error
            ? detailQuery.error.message
            : "Failed to load file details."}
        </TypographyP>
      </div>
    );
  }

  const detail = detailQuery.data;
  const latestVersion = detail?.versions[0];
  const latestContent = latestVersion?.content ?? null;
  const sourceStringsPreview = parseSourceStringsFromFileContent(latestContent);
  const textPreview =
    latestContent?.text && !sourceStringsPreview ? truncatePreview(latestContent.text) : null;
  const displayByteSize = latestVersion?.byteSize ?? file.byteSize;

  const jobsByLocale = detail?.jobsByLocale ?? [];
  const orderedJobsByLocale = highlightLocale
    ? [
        ...jobsByLocale.filter((group) => group.locale === highlightLocale),
        ...jobsByLocale.filter((group) => group.locale !== highlightLocale),
      ]
    : jobsByLocale;

  return (
    <div className="flex min-h-0 flex-col gap-6 px-5 py-4">
      <header className="space-y-2 border-b border-foreground/8 pb-4">
        <TypographyP className="font-mono text-sm font-medium text-foreground">
          {sourcePath}
        </TypographyP>
        <div className="flex flex-wrap items-center gap-2">
          {file.provider ? (
            <Badge variant="outline" className="rounded-full text-[10px]">
              {providerName(file.provider.kind)}
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
          <TypographyP className="text-xs text-foreground/42">
            {fileMetadataLine(displayByteSize, latestVersion?.revision, file.uploadedAt)}
          </TypographyP>
        </div>
        {latestVersion?.sourceHash ? (
          <TypographyP className="font-mono text-xs text-foreground/42">
            Hash {latestVersion.sourceHash}
          </TypographyP>
        ) : null}
      </header>

      <section className="space-y-2">
        <TypographyP className="text-xs font-medium tracking-wide text-foreground/52 uppercase">
          Source preview
        </TypographyP>
        {sourceStringsPreview ? (
          <ProjectFileSourceStringsPreview
            organizationSlug={organizationSlug}
            projectId={projectId}
            sourcePath={sourcePath}
            sourceStrings={sourceStringsPreview}
            canFindInRepo={canFindInRepo}
          />
        ) : textPreview ? (
          <div className="overflow-hidden rounded-md border border-foreground/8 bg-background">
            <pre className="max-h-[min(24rem,50vh)] overflow-auto p-3 font-mono text-xs leading-relaxed text-foreground/82 whitespace-pre-wrap wrap-break-word">
              {textPreview.text}
            </pre>
            {textPreview.truncated ? (
              <TypographyP className="border-t border-foreground/8 px-3 py-2 text-xs text-foreground/42">
                Preview truncated. Download the full file from a completed job output when
                available.
              </TypographyP>
            ) : null}
          </div>
        ) : (
          <TypographyP className="text-sm text-foreground/52">
            No text preview is available for this file yet.
          </TypographyP>
        )}
      </section>

      {orderedJobsByLocale.length > 0 ? (
        <section className="space-y-3">
          <TypographyP className="text-xs font-medium tracking-wide text-foreground/52 uppercase">
            Jobs by locale
          </TypographyP>
          <div className="flex flex-col gap-3">
            {orderedJobsByLocale.map((group) => (
              <div
                key={group.locale}
                className={cn(
                  "rounded-md border border-foreground/8 bg-background/60 p-3",
                  highlightLocale === group.locale && "border-primary/40 bg-primary/5",
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
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-foreground/5"
                      >
                        <span className="font-mono text-xs text-foreground/72">{job.id}</span>
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
