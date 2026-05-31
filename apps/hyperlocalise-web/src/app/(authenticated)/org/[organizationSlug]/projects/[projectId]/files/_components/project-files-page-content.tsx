"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download01Icon, File01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { File as DiffFile, MultiFileDiff, type FileContents } from "@pierre/diffs/react";
import { useQuery } from "@tanstack/react-query";

import { FileTree, FileTreeFile, FileTreeFolder } from "@/components/ai-elements/file-tree";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";

import {
  collectLocaleOptions,
  defaultWorkspaceFileFilters,
  formatRelativeTimestamp,
  ProviderKindBadge,
  ResourceTypeBadge,
  SourceOriginBadge,
  summarizeLocaleReadiness,
  SyncStateBadge,
  toProjectFilesApiQuery,
  useStaleLocaleFilterReset,
  WorkspaceFilesFilterBar,
  workspaceFileFiltersWithoutLocale,
  type WorkspaceFileFilters,
} from "../../../../_components/workspace-files-shared";
import { toneClass, type Tone } from "../../../../_components/workspace-resource-shared";
import { ProjectPageShell, ProjectSectionHeader } from "../../_components/project-page-shell";
import { TypographyH3, TypographyP } from "@/components/ui/typography";
import type {
  ProjectFileDetailResponse,
  ProjectFileJobRecord,
  ProjectFileProviderJobRecord,
  ProjectFileRecord,
  ProjectFileVersionRecord,
} from "@/api/routes/project/project.schema";

type TreeNode = {
  name: string;
  path: string;
  children: TreeNode[];
  file?: ProjectFileRecord;
};

function jobTone(status: NonNullable<ProjectFileRecord["latestJob"]>["status"]): Tone {
  switch (status) {
    case "succeeded":
      return "safe";
    case "failed":
      return "risk";
    case "queued":
    case "waiting_for_review":
      return "watch";
    default:
      return "info";
  }
}

function buildTree(files: ProjectFileRecord[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: [] };
  const nodeMap = new Map<string, TreeNode>([["", root]]);

  for (const file of files) {
    const parts = file.sourcePath.split("/").filter(Boolean);
    let parentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const path = parentPath ? `${parentPath}/${part}` : part;
      let node = nodeMap.get(path);

      if (!node) {
        node = {
          name: part,
          path,
          children: [],
          file: i === parts.length - 1 ? file : undefined,
        };
        nodeMap.set(path, node);
        nodeMap.get(parentPath)!.children.push(node);
      } else if (i === parts.length - 1) {
        if (!node.file) {
          node.file = file;
        } else {
          if (file.provider && !node.file.provider) {
            node.file = { ...node.file, provider: file.provider };
          }
          if (file.latestJob && !node.file.latestJob) {
            node.file = { ...node.file, latestJob: file.latestJob };
          }
        }
      }

      parentPath = path;
    }
  }

  // Sort: folders first, then files, both alphabetically
  function sortChildren(node: TreeNode) {
    node.children.sort((a, b) => {
      const aIsFolder = a.children.length > 0 || a.file === undefined;
      const bIsFolder = b.children.length > 0 || b.file === undefined;
      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortChildren);
  }

  sortChildren(root);
  return root;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatMaybeBytes(bytes: number | null): string {
  return typeof bytes === "number" ? formatBytes(bytes) : "—";
}

function shortSha(value: string | null) {
  return value ? value.slice(0, 10) : "—";
}

function versionLabel(version: ProjectFileVersionRecord, index: number, total: number) {
  const date = new Date(version.uploadedAt).toLocaleString();
  const originLabel = version.origin === "provider" ? "provider" : "repo";
  const revisionLabel = version.revision ? ` · rev ${version.revision}` : "";
  return `${originLabel} v${total - index} · ${date}${revisionLabel} · ${shortSha(version.sourceHash)}`;
}

function toDiffFile(version: ProjectFileVersionRecord): FileContents | null {
  if (!version.content) {
    return null;
  }

  return {
    name: version.filename,
    contents: version.content.text,
    cacheKey: `${version.id}:${version.sha256}`,
  };
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
        {label}
      </TypographyP>
      <TypographyP className="mt-1 truncate font-mono text-sm text-foreground/72">
        {value ?? "—"}
      </TypographyP>
    </div>
  );
}

function SourceViewer({ version }: { version: ProjectFileVersionRecord }) {
  const file = toDiffFile(version);

  if (!file) {
    return (
      <TypographyP className="rounded-md border border-foreground/8 bg-background/40 p-3 text-sm text-foreground/52">
        Inline preview is unavailable for this file.
      </TypographyP>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-foreground/8 bg-background">
      <DiffFile
        file={file}
        disableWorkerPool
        options={{ disableFileHeader: true, overflow: "scroll", themeType: "system" }}
      />
    </div>
  );
}

function VersionDiff({
  before,
  after,
}: {
  before: ProjectFileVersionRecord | undefined;
  after: ProjectFileVersionRecord | undefined;
}) {
  const beforeFile = before ? toDiffFile(before) : null;
  const afterFile = after ? toDiffFile(after) : null;

  if (!beforeFile || !afterFile) {
    return (
      <TypographyP className="rounded-md border border-foreground/8 bg-background/40 p-3 text-sm text-foreground/52">
        Select two previewable text versions to render a diff.
      </TypographyP>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-foreground/8 bg-background">
      <MultiFileDiff
        oldFile={beforeFile}
        newFile={afterFile}
        disableWorkerPool
        options={{
          diffStyle: "unified",
          diffIndicators: "classic",
          hunkSeparators: "metadata",
          overflow: "scroll",
          themeType: "system",
        }}
      />
    </div>
  );
}

function LocaleReadinessTable({ localeReadiness }: { localeReadiness: Record<string, unknown> }) {
  const entries = Object.entries(localeReadiness);
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-md border border-foreground/8">
      <table className="w-full text-left text-xs">
        <thead className="bg-foreground/4 text-foreground/42">
          <tr>
            <th className="px-3 py-2 font-medium">Locale</th>
            <th className="px-3 py-2 font-medium">Readiness</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([locale, value]) => (
            <tr key={locale} className="border-t border-foreground/8">
              <td className="px-3 py-2 font-mono text-foreground/72">{locale}</td>
              <td className="px-3 py-2 text-foreground/72">{String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProviderJobGroup({
  organizationSlug,
  locale,
  jobs,
}: {
  organizationSlug: string;
  locale: string;
  jobs: ProjectFileProviderJobRecord[];
}) {
  return (
    <div className="rounded-md border border-foreground/8 bg-background/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <TypographyP className="font-medium text-foreground">{locale}</TypographyP>
        <TypographyP className="text-xs text-foreground/42">
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
        </TypographyP>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="border-t border-foreground/8 pt-3 first:border-t-0 first:pt-0"
          >
            <div className="flex flex-wrap items-center gap-2">
              <ProviderKindBadge kind={job.providerKind} />
              <Badge variant="outline" className="rounded-full">
                {job.externalStatus}
              </Badge>
              <SyncStateBadge syncState={job.syncState} />
            </div>
            <TypographyP className="mt-1 text-sm font-medium text-foreground">
              {job.title}
            </TypographyP>
            <TypographyP className="mt-1 font-mono text-xs text-foreground/52">
              {job.id}
            </TypographyP>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="xs"
                render={<Link href={`/org/${organizationSlug}/jobs/${job.id}`} />}
              >
                View job
              </Button>
              {job.externalUrl ? (
                <Button
                  variant="outline"
                  size="xs"
                  render={<a href={job.externalUrl} target="_blank" />}
                >
                  Open in provider
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobGroup({ locale, jobs }: { locale: string; jobs: ProjectFileJobRecord[] }) {
  return (
    <div className="rounded-md border border-foreground/8 bg-background/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <TypographyP className="font-medium text-foreground">{locale}</TypographyP>
        <TypographyP className="text-xs text-foreground/42">
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
        </TypographyP>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="border-t border-foreground/8 pt-3 first:border-t-0 first:pt-0"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn("rounded-full", toneClass(jobTone(job.status)))}
              >
                {job.status}
              </Badge>
              <TypographyP className="font-mono text-xs text-foreground/52">{job.id}</TypographyP>
            </div>
            <TypographyP className="mt-1 text-xs text-foreground/42">
              Created {new Date(job.createdAt).toLocaleString()}
            </TypographyP>

            {job.outputs.length > 0 ? (
              <div className="mt-3 flex flex-col gap-3">
                {job.outputs
                  .filter((output) => output.locale === locale)
                  .map((output) => (
                    <div
                      key={`${job.id}:${output.fileId}`}
                      className="rounded-md bg-foreground/3 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <TypographyP className="truncate text-sm font-medium text-foreground">
                            {output.filename}
                          </TypographyP>
                          <TypographyP className="mt-1 font-mono text-xs text-foreground/42">
                            {output.fileId}
                          </TypographyP>
                        </div>
                        <Button
                          variant="outline"
                          size="xs"
                          render={<a href={output.downloadPath} />}
                        >
                          <HugeiconsIcon
                            icon={Download01Icon}
                            strokeWidth={1.8}
                            className="size-3"
                          />
                          Download
                        </Button>
                      </div>
                      <TypographyP className="mt-2 text-xs text-foreground/42">
                        {output.byteSize !== null ? formatBytes(output.byteSize) : "Unknown size"}
                        {output.sha256 ? ` · ${shortSha(output.sha256)}` : ""}
                      </TypographyP>
                      {output.content ? (
                        <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-foreground/8 bg-background p-3 text-xs leading-5 text-foreground/72">
                          {output.content.text}
                        </pre>
                      ) : null}
                    </div>
                  ))}
              </div>
            ) : (
              <TypographyP className="mt-2 text-xs text-foreground/42">
                No output files recorded for this job.
              </TypographyP>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FileTreeNode({ node }: { node: TreeNode }) {
  if (node.file) {
    return (
      <FileTreeFile path={node.path} name={node.name}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="size-4 shrink-0" />
          <span className="truncate">{node.name}</span>
          <SourceOriginBadge origin={node.file.origin} />
          {node.file.provider ? (
            <>
              <ProviderKindBadge kind={node.file.provider.kind} />
              <ResourceTypeBadge resourceType={node.file.provider.resourceType} />
              <SyncStateBadge syncState={node.file.provider.syncState} />
            </>
          ) : null}
          {node.file.latestJob ? (
            <Badge
              variant="outline"
              className={cn(
                node.file.provider
                  ? "shrink-0 rounded-full text-xs"
                  : "ml-auto shrink-0 rounded-full text-xs",
                toneClass(jobTone(node.file.latestJob.status)),
              )}
            >
              {node.file.latestJob.status}
            </Badge>
          ) : null}
        </div>
      </FileTreeFile>
    );
  }

  return (
    <FileTreeFolder path={node.path} name={node.name}>
      {node.children.map((child) => (
        <FileTreeNode key={child.path} node={child} />
      ))}
    </FileTreeFolder>
  );
}

export function ProjectFilesPageContent({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const searchParams = useSearchParams();
  const initialSourcePath = searchParams.get("sourcePath") ?? undefined;
  const [filters, setFilters] = useState<WorkspaceFileFilters>(defaultWorkspaceFileFilters);
  const [selectedPath, setSelectedPath] = useState<string | undefined>(initialSourcePath);
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>();
  const [baseVersionId, setBaseVersionId] = useState<string | undefined>();
  const [compareVersionId, setCompareVersionId] = useState<string | undefined>();

  const filtersForLocaleOptions = useMemo(
    () => workspaceFileFiltersWithoutLocale(filters),
    [filters],
  );

  const filesQuery = useQuery({
    queryKey: ["project-files", organizationSlug, projectId, filters],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.$get({
        param: { organizationSlug, projectId },
        query: toProjectFilesApiQuery(filters),
      });
      if (!response.ok) {
        throw new Error(`Failed to load files (${response.status})`);
      }
      const body = await response.json();
      return body.files as ProjectFileRecord[];
    },
  });

  const localeDiscoveryQuery = useQuery({
    queryKey: ["project-files-locales", organizationSlug, projectId, filtersForLocaleOptions],
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.$get({
        param: { organizationSlug, projectId },
        query: toProjectFilesApiQuery(filtersForLocaleOptions),
      });
      if (!response.ok) {
        throw new Error(`Failed to load locale options (${response.status})`);
      }
      const body = await response.json();
      return body.files as ProjectFileRecord[];
    },
  });

  const fileDetailQuery = useQuery({
    queryKey: ["project-file-detail", organizationSlug, projectId, selectedPath],
    enabled: Boolean(selectedPath),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.$get({
        param: { organizationSlug, projectId },
        query: { sourcePath: selectedPath ?? "" },
      });
      if (!response.ok) {
        throw new Error(`Failed to load file detail (${response.status})`);
      }
      return (await response.json()) as ProjectFileDetailResponse;
    },
  });

  const files = filesQuery.data ?? [];
  const localeOptions = useMemo(
    () => collectLocaleOptions(localeDiscoveryQuery.data ?? []),
    [localeDiscoveryQuery.data],
  );

  useStaleLocaleFilterReset(filters, setFilters, localeOptions);
  const tree = buildTree(files);
  const selectedFile = files.find((f) => f.sourcePath === selectedPath);
  const providerOnlyFilterActive =
    filters.origin === "all" && (filters.locale !== "all" || filters.syncState !== "all");
  const fileDetail = fileDetailQuery.data?.file;
  const versions = useMemo(() => fileDetail?.versions ?? [], [fileDetail?.versions]);
  const selectedVersion =
    versions.find((version) => version.id === selectedVersionId) ?? versions[0];
  const baseVersion = versions.find((version) => version.id === baseVersionId) ?? versions.at(1);
  const compareVersion =
    versions.find((version) => version.id === compareVersionId) ?? selectedVersion ?? versions[0];
  const selectedVersionJobs = useMemo(() => {
    if (!fileDetail || !selectedVersion || selectedVersion.origin === "provider") {
      return [];
    }

    return fileDetail.jobsByLocale
      .map((group) => ({
        locale: group.locale,
        jobs: group.jobs.filter((job) => job.sourceFileVersionId === selectedVersion.id),
      }))
      .filter((group) => group.jobs.length > 0);
  }, [fileDetail, selectedVersion]);

  const providerJobsByLocale = fileDetail?.providerJobsByLocale ?? [];

  useEffect(() => {
    if (versions.length === 0) {
      setSelectedVersionId(undefined);
      setBaseVersionId(undefined);
      setCompareVersionId(undefined);
      return;
    }

    setSelectedVersionId((current) =>
      current && versions.some((version) => version.id === current) ? current : versions[0]?.id,
    );
    setCompareVersionId((current) =>
      current && versions.some((version) => version.id === current) ? current : versions[0]?.id,
    );
    setBaseVersionId((current) =>
      current && versions.some((version) => version.id === current) ? current : versions[1]?.id,
    );
  }, [versions]);

  useEffect(() => {
    if (filesQuery.isLoading || filesQuery.isFetching) {
      return;
    }

    if (files.length === 0) {
      return;
    }

    if (!selectedPath) {
      setSelectedPath(files[0].sourcePath);
      return;
    }

    if (!files.some((file) => file.sourcePath === selectedPath)) {
      setSelectedPath(files[0].sourcePath);
    }
  }, [files, selectedPath, filesQuery.isLoading, filesQuery.isFetching]);

  return (
    <ProjectPageShell>
      <ProjectSectionHeader
        icon={Folder01Icon}
        section="Files"
        description="Browse repository source files, synced provider files, and translation keys."
      />

      <WorkspaceFilesFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        localeOptions={localeOptions}
        projectOptions={[]}
        showProjectFilter={false}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_min(32rem,42vw)]">
        <div className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-4">
          {filesQuery.isLoading ? (
            <TypographyP className="text-sm text-foreground/52">Loading files…</TypographyP>
          ) : filesQuery.isError ? (
            <TypographyP className="text-sm text-flame-100">Failed to load files.</TypographyP>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <HugeiconsIcon
                icon={File01Icon}
                strokeWidth={1.8}
                className="size-8 text-foreground/24"
              />
              <TypographyP className="text-sm text-foreground/52">
                {providerOnlyFilterActive
                  ? "No provider-backed files match these filters. Locale and sync-state filters do not include repository files."
                  : "No source files found for this project."}
              </TypographyP>
            </div>
          ) : (
            <FileTree
              selectedPath={selectedPath}
              onSelect={(path) => setSelectedPath(path)}
              defaultExpanded={new Set(tree.children.map((c) => c.path))}
            >
              {tree.children.map((child) => (
                <FileTreeNode key={child.path} node={child} />
              ))}
            </FileTree>
          )}
        </div>

        <div className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-4">
          {selectedFile ? (
            <div className="flex flex-col gap-4">
              <div>
                <TypographyH3 className="text-base font-medium text-foreground">
                  {selectedFile.filename}
                </TypographyH3>
                <TypographyP className="mt-1 text-xs text-foreground/42">
                  {selectedFile.sourcePath}
                </TypographyP>
              </div>

              <div className="grid gap-3">
                <div>
                  <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                    Stored file
                  </TypographyP>
                  <TypographyP className="mt-1 text-sm text-foreground/72">
                    {selectedFile.storedFileId ?? "—"}
                  </TypographyP>
                </div>
                <div>
                  <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                    Size
                  </TypographyP>
                  <TypographyP className="mt-1 text-sm text-foreground/72">
                    {formatMaybeBytes(selectedFile.byteSize)}
                  </TypographyP>
                </div>
                {selectedFile.provider ? (
                  <>
                    <div>
                      <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                        Provider
                      </TypographyP>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <ProviderKindBadge kind={selectedFile.provider.kind} />
                        <ResourceTypeBadge resourceType={selectedFile.provider.resourceType} />
                        <SyncStateBadge syncState={selectedFile.provider.syncState} />
                        <SourceOriginBadge origin={selectedFile.origin} />
                      </div>
                    </div>
                    <DetailRow
                      label="Last synced"
                      value={
                        selectedFile.provider.lastSyncedAt
                          ? formatRelativeTimestamp(selectedFile.provider.lastSyncedAt)
                          : null
                      }
                    />
                    <DetailRow
                      label="External ID"
                      value={selectedFile.provider.externalResourceId}
                    />
                    <DetailRow label="Format" value={selectedFile.provider.format} />
                    <DetailRow label="Revision" value={selectedFile.provider.revision} />
                    <DetailRow label="Source locale" value={selectedFile.provider.sourceLocale} />
                    <DetailRow
                      label="Target locales"
                      value={
                        selectedFile.provider.targetLocales.length > 0
                          ? selectedFile.provider.targetLocales.join(", ")
                          : null
                      }
                    />
                    <div>
                      <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                        Locale readiness
                      </TypographyP>
                      <div className="mt-2">
                        <LocaleReadinessTable
                          localeReadiness={selectedFile.provider.localeReadiness}
                        />
                        {Object.keys(selectedFile.provider.localeReadiness).length === 0 ? (
                          <TypographyP className="text-sm text-foreground/52">
                            {summarizeLocaleReadiness(selectedFile.provider.localeReadiness) ??
                              "No locale readiness data yet."}
                          </TypographyP>
                        ) : null}
                      </div>
                    </div>
                    {selectedFile.provider.externalUrl ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-fit"
                        render={<a href={selectedFile.provider.externalUrl} target="_blank" />}
                      >
                        Open in provider
                      </Button>
                    ) : null}
                  </>
                ) : null}
                <div>
                  <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                    Source hash
                  </TypographyP>
                  <TypographyP className="mt-1 truncate font-mono text-sm text-foreground/72">
                    {selectedFile.sourceHash ?? "—"}
                  </TypographyP>
                </div>
                {selectedFile.commitSha ? (
                  <div>
                    <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                      Commit
                    </TypographyP>
                    <TypographyP className="mt-1 truncate font-mono text-sm text-foreground/72">
                      {selectedFile.commitSha}
                    </TypographyP>
                  </div>
                ) : null}
                {selectedFile.workflowRunId ? (
                  <div>
                    <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                      Workflow run
                    </TypographyP>
                    <TypographyP className="mt-1 truncate font-mono text-sm text-foreground/72">
                      {selectedFile.workflowRunId}
                    </TypographyP>
                  </div>
                ) : null}
                <div>
                  <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                    Uploaded
                  </TypographyP>
                  <TypographyP className="mt-1 text-sm text-foreground/72">
                    {new Date(selectedFile.uploadedAt).toLocaleString()}
                  </TypographyP>
                </div>
              </div>

              {fileDetailQuery.isLoading ? (
                <div className="border-t border-foreground/8 pt-4">
                  <TypographyP className="text-sm text-foreground/52">
                    Loading file detail…
                  </TypographyP>
                </div>
              ) : fileDetailQuery.isError ? (
                <div className="border-t border-foreground/8 pt-4">
                  <TypographyP className="text-sm text-flame-100">
                    Failed to load file detail.
                  </TypographyP>
                </div>
              ) : fileDetail && versions.length > 0 && selectedVersion ? (
                <div className="flex flex-col gap-5 border-t border-foreground/8 pt-4">
                  <div className="flex flex-col gap-2">
                    <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                      Source versions
                    </TypographyP>
                    <select
                      value={selectedVersion.id}
                      onChange={(event) => setSelectedVersionId(event.target.value)}
                      className="h-9 rounded-md border border-foreground/8 bg-background px-3 text-sm text-foreground outline-none"
                    >
                      {versions.map((version, index) => (
                        <option key={version.id} value={version.id}>
                          {versionLabel(version, index, versions.length)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-3">
                    <DetailRow label="Version ID" value={selectedVersion.id} />
                    <DetailRow
                      label="Origin"
                      value={selectedVersion.origin === "provider" ? "Provider" : "Repository"}
                    />
                    <DetailRow label="Source hash" value={selectedVersion.sourceHash} />
                    {selectedVersion.revision ? (
                      <DetailRow label="Revision" value={selectedVersion.revision} />
                    ) : null}
                    {selectedVersion.origin === "repository" ? (
                      <>
                        <DetailRow label="Commit" value={selectedVersion.commitSha} />
                        <DetailRow label="Workflow run" value={selectedVersion.workflowRunId} />
                      </>
                    ) : null}
                    <DetailRow
                      label="Captured"
                      value={new Date(selectedVersion.uploadedAt).toLocaleString()}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                      Source preview
                    </TypographyP>
                    <SourceViewer version={selectedVersion} />
                  </div>

                  {versions.length > 1 ? (
                    <div className="flex flex-col gap-3">
                      <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                        Diff
                      </TypographyP>
                      <div className="grid gap-2 md:grid-cols-2">
                        <select
                          value={baseVersion?.id ?? ""}
                          onChange={(event) => setBaseVersionId(event.target.value)}
                          className="h-9 rounded-md border border-foreground/8 bg-background px-3 text-sm text-foreground outline-none"
                        >
                          {versions.map((version, index) => (
                            <option key={version.id} value={version.id}>
                              Base {versionLabel(version, index, versions.length)}
                            </option>
                          ))}
                        </select>
                        <select
                          value={compareVersion?.id ?? ""}
                          onChange={(event) => setCompareVersionId(event.target.value)}
                          className="h-9 rounded-md border border-foreground/8 bg-background px-3 text-sm text-foreground outline-none"
                        >
                          {versions.map((version, index) => (
                            <option key={version.id} value={version.id}>
                              Compare {versionLabel(version, index, versions.length)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <VersionDiff before={baseVersion} after={compareVersion} />
                    </div>
                  ) : null}

                  {selectedVersion.origin === "repository" ? (
                    <div className="flex flex-col gap-3">
                      <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                        Translation jobs
                      </TypographyP>
                      {selectedVersionJobs.length > 0 ? (
                        selectedVersionJobs.map((group) => (
                          <JobGroup key={group.locale} locale={group.locale} jobs={group.jobs} />
                        ))
                      ) : (
                        <TypographyP className="rounded-md border border-foreground/8 bg-background/40 p-3 text-sm text-foreground/52">
                          No translation jobs for this source version yet.
                        </TypographyP>
                      )}
                    </div>
                  ) : null}

                  {providerJobsByLocale.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                        Provider jobs
                      </TypographyP>
                      {providerJobsByLocale.map((group) => (
                        <ProviderJobGroup
                          key={group.locale}
                          organizationSlug={organizationSlug}
                          locale={group.locale}
                          jobs={group.jobs}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : fileDetail ? (
                <div className="border-t border-foreground/8 pt-4">
                  <TypographyP className="text-xs text-foreground/42">
                    No stored source versions yet. Sync provider content or upload a repository file
                    to enable preview and diff.
                  </TypographyP>
                  {providerJobsByLocale.length > 0 ? (
                    <div className="mt-4 flex flex-col gap-3">
                      <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                        Provider jobs
                      </TypographyP>
                      {providerJobsByLocale.map((group) => (
                        <ProviderJobGroup
                          key={group.locale}
                          organizationSlug={organizationSlug}
                          locale={group.locale}
                          jobs={group.jobs}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="border-t border-foreground/8 pt-4">
                  <TypographyP className="text-xs text-foreground/42">
                    No version detail found for this file.
                  </TypographyP>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <HugeiconsIcon
                icon={File01Icon}
                strokeWidth={1.8}
                className="size-8 text-foreground/24"
              />
              <TypographyP className="text-sm text-foreground/52">
                Select a file to view details.
              </TypographyP>
            </div>
          )}
        </div>
      </div>
    </ProjectPageShell>
  );
}
