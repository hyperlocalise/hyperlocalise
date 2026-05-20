"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft01Icon, File01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import { FileTree, FileTreeFile, FileTreeFolder } from "@/components/ai-elements/file-tree";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/utils";

import {
  PageHeader,
  toneClass,
  type Tone,
} from "../../../../_components/workspace-resource-shared";
import { TypographyH3, TypographyP } from "@/components/ui/typography";

type ApiFile = {
  sourcePath: string;
  sourceHash: string | null;
  commitSha: string | null;
  workflowRunId: string | null;
  uploadedAt: string;
  storedFileId: string;
  metadata: Record<string, unknown>;
  filename: string;
  byteSize: number;
  latestJob: {
    id: string;
    status: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
    createdAt: string;
    type: "string" | "file";
  } | null;
};

type TreeNode = {
  name: string;
  path: string;
  children: TreeNode[];
  file?: ApiFile;
};

function jobTone(status: NonNullable<ApiFile["latestJob"]>["status"]): Tone {
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

function buildTree(files: ApiFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: [] };

  for (const file of files) {
    const parts = file.sourcePath.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const path = parts.slice(0, i + 1).join("/");
      const existing = current.children.find((c) => c.name === part);

      if (existing) {
        current = existing;
      } else {
        const node: TreeNode = {
          name: part,
          path,
          children: [],
          file: i === parts.length - 1 ? file : undefined,
        };
        current.children.push(node);
        current = node;
      }
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
      return body.files as ApiFile[];
    },
  });

  const files = filesQuery.data ?? [];
  const tree = buildTree(files);
  const selectedFile = files.find((f) => f.sourcePath === selectedPath);

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

              {selectedFile.latestJob ? (
                <div className="border-t border-foreground/8 pt-4">
                  <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                    Latest job
                  </TypographyP>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full",
                        toneClass(jobTone(selectedFile.latestJob.status)),
                      )}
                    >
                      {selectedFile.latestJob.status}
                    </Badge>
                    <TypographyP className="text-sm text-foreground/72">
                      {selectedFile.latestJob.type}
                    </TypographyP>
                  </div>
                  <TypographyP className="mt-1 text-xs text-foreground/42">
                    {selectedFile.latestJob.id}
                  </TypographyP>
                  <TypographyP className="mt-1 text-xs text-foreground/42">
                    Created {new Date(selectedFile.latestJob.createdAt).toLocaleString()}
                  </TypographyP>
                </div>
              ) : (
                <div className="border-t border-foreground/8 pt-4">
                  <TypographyP className="text-xs text-foreground/42">
                    No translation jobs for this file yet.
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
