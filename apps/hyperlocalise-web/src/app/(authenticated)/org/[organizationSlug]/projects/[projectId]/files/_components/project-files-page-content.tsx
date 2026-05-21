"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft01Icon,
  Download01Icon,
  File01Icon,
  Folder01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { File as DiffFile, MultiFileDiff, type FileContents } from "@pierre/diffs/react";
import { useQuery } from "@tanstack/react-query";

import { FileTree, FileTreeFile, FileTreeFolder } from "@/components/ai-elements/file-tree";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/utils";

import {
  PageHeader,
  toneClass,
  type Tone,
} from "../../../../_components/workspace-resource-shared";
import { TypographyH3, TypographyP } from "@/components/ui/typography";
import type {
  ProjectFileDetailResponse,
  ProjectFileJobRecord,
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

function shortSha(value: string | null) {
  return value ? value.slice(0, 10) : "—";
}

function versionLabel(version: ProjectFileVersionRecord, index: number) {
  const date = new Date(version.uploadedAt).toLocaleString();
  return `v${index + 1} · ${date} · ${shortSha(version.sourceHash)}`;
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
                {job.outputs.map((output) => (
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
                      <Button variant="outline" size="xs" render={<a href={output.downloadPath} />}>
                        <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} className="size-3" />
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
          {node.file.latestJob ? (
            <Badge
              variant="outline"
              className={cn(
                "ml-auto shrink-0 rounded-full text-xs",
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
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>();
  const [baseVersionId, setBaseVersionId] = useState<string | undefined>();
  const [compareVersionId, setCompareVersionId] = useState<string | undefined>();

  const projectQuery = useQuery({
    queryKey: ["project", organizationSlug, projectId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].$get({
        param: { organizationSlug, projectId },
      });
      if (!response.ok) {
        throw new Error(`Failed to load project (${response.status})`);
      }
      const body = await response.json();
      return body.project;
    },
  });

  const filesQuery = useQuery({
    queryKey: ["project-files", organizationSlug, projectId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.$get({
        param: { organizationSlug, projectId },
      });
      if (!response.ok) {
        throw new Error(`Failed to load files (${response.status})`);
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
  const tree = buildTree(files);
  const selectedFile = files.find((f) => f.sourcePath === selectedPath);
  const fileDetail = fileDetailQuery.data?.file;
  const versions = useMemo(() => fileDetail?.versions ?? [], [fileDetail?.versions]);
  const selectedVersion =
    versions.find((version) => version.id === selectedVersionId) ?? versions[0];
  const baseVersion = versions.find((version) => version.id === baseVersionId) ?? versions.at(1);
  const compareVersion =
    versions.find((version) => version.id === compareVersionId) ?? selectedVersion ?? versions[0];
  const selectedVersionJobs = useMemo(() => {
    if (!fileDetail || !selectedVersion) {
      return [];
    }

    return fileDetail.jobsByLocale
      .map((group) => ({
        locale: group.locale,
        jobs: group.jobs.filter((job) => job.sourceFileVersionId === selectedVersion.id),
      }))
      .filter((group) => group.jobs.length > 0);
  }, [fileDetail, selectedVersion]);

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
      current && versions.some((version) => version.id === current)
        ? current
        : (versions[1]?.id ?? versions[0]?.id),
    );
  }, [versions]);

  const stats = {
    total: files.length,
    withJobs: files.filter((f) => f.latestJob !== null).length,
    latestUpload:
      files.length > 0
        ? new Date(
            Math.max(...files.map((f) => new Date(f.uploadedAt).getTime())),
          ).toLocaleDateString()
        : "—",
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-col gap-4">
        <Link
          href={`/org/${organizationSlug}/projects`}
          className="flex w-fit items-center gap-1 text-sm text-foreground/48 transition-colors hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} className="size-4" />
          Projects
        </Link>
        <PageHeader
          icon={Folder01Icon}
          label="Project files"
          title={projectQuery.data?.name ?? "Project files"}
          description="Browse repository source files and their latest translation jobs for this project."
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-4">
          <TypographyP className="text-sm text-foreground/52">Source files</TypographyP>
          <TypographyP className="mt-2 font-heading text-3xl font-medium text-foreground">
            {stats.total}
          </TypographyP>
        </div>
        <div className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-4">
          <TypographyP className="text-sm text-foreground/52">With translation jobs</TypographyP>
          <TypographyP className="mt-2 font-heading text-3xl font-medium text-foreground">
            {stats.withJobs}
          </TypographyP>
        </div>
        <div className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-4">
          <TypographyP className="text-sm text-foreground/52">Latest upload</TypographyP>
          <TypographyP className="mt-2 font-heading text-3xl font-medium text-foreground">
            {stats.latestUpload}
          </TypographyP>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
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
                No repository source files found for this project.
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
                    {selectedFile.storedFileId}
                  </TypographyP>
                </div>
                <div>
                  <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                    Size
                  </TypographyP>
                  <TypographyP className="mt-1 text-sm text-foreground/72">
                    {formatBytes(selectedFile.byteSize)}
                  </TypographyP>
                </div>
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
              ) : fileDetail && selectedVersion ? (
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
                          {versionLabel(version, index)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-3">
                    <DetailRow label="Version ID" value={selectedVersion.id} />
                    <DetailRow label="Source hash" value={selectedVersion.sourceHash} />
                    <DetailRow label="Commit" value={selectedVersion.commitSha} />
                    <DetailRow label="Workflow run" value={selectedVersion.workflowRunId} />
                    <DetailRow
                      label="Uploaded"
                      value={new Date(selectedVersion.uploadedAt).toLocaleString()}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                      Source preview
                    </TypographyP>
                    <SourceViewer version={selectedVersion} />
                  </div>

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
                            Base {versionLabel(version, index)}
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
                            Compare {versionLabel(version, index)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <VersionDiff before={baseVersion} after={compareVersion} />
                  </div>

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
    </div>
  );
}
