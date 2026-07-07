"use client";

import Link from "next/link";
import { ClipboardListIcon } from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { formatRelativeTimestamp } from "../../_components/workspace-files-shared";

export const ISSUES_PAGE_SIZE = 50;

const views = [
  { value: "all_open", label: "All open" },
  { value: "my_work", label: "My work" },
  { value: "qa_triage", label: "QA triage" },
  { value: "source_context", label: "Source & context" },
] as const;

type IssueView = (typeof views)[number]["value"];

type OrganizationIssue = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  issueType: string;
  status: string;
  targetLocale: string | null;
  sourcePath: string | null;
  linkKind: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  reporter: string | null;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
};

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusVariant(status: string) {
  if (status === "resolved") return "success" as const;
  if (status === "wont_fix") return "outline" as const;
  if (status === "in_progress") return "warning" as const;
  return "secondary" as const;
}

function IssueRowSkeleton() {
  return (
    <tr>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-2 h-3 w-full max-w-xs" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-6 w-28 rounded-full" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-24" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-16" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-32" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-20" />
      </td>
    </tr>
  );
}

export function IssuesPageView({
  organizationSlug,
  issues,
  summary,
  view,
  search,
  isLoading,
  isError,
  isFetchingMore,
  hasMore,
  onViewChange,
  onSearchChange,
  onLoadMore,
}: {
  organizationSlug: string;
  issues: OrganizationIssue[];
  summary?: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    wontFix: number;
  };
  view: IssueView;
  search: string;
  isLoading: boolean;
  isError: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  onViewChange: (view: IssueView) => void;
  onSearchChange: (search: string) => void;
  onLoadMore: () => void;
}) {
  return (
    <WorkspacePageShell>
      <PageHeader
        icon={ClipboardListIcon}
        label="Workspace"
        title="Issues"
        description="Open issues across all projects in this workspace."
      />

      <div className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-[220px_1fr]">
        <Select
          value={view}
          onValueChange={(value) => onViewChange((value ?? "all_open") as IssueView)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="View" />
          </SelectTrigger>
          <SelectContent>
            {views.map((item) => (
              <SelectItem key={item.value} value={item.value} label={item.label}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          placeholder="Search title, description, project, or source path"
        />
      </div>

      {summary ? (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{summary.total} total</Badge>
          <Badge variant="secondary">{summary.open} open</Badge>
          <Badge variant="warning">{summary.inProgress} in progress</Badge>
          <Badge variant="success">{summary.resolved} resolved</Badge>
        </div>
      ) : isLoading ? (
        <div className="flex flex-wrap gap-2" aria-busy="true" aria-label="Loading issue summary">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-6 w-20 rounded-full" />
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-56 px-4 py-3 font-medium">Issue</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium">Locale</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => <IssueRowSkeleton key={index} />)
            ) : isError ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Issues could not be loaded.
                </td>
              </tr>
            ) : issues.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No issues match this view.
                </td>
              </tr>
            ) : (
              issues.map((issue) => (
                <tr key={`${issue.projectId}:${issue.id}`} className="align-top">
                  <td className="max-w-80 px-4 py-3">
                    <Link
                      href={`/org/${organizationSlug}/projects/${encodeURIComponent(issue.projectId)}/issue-sheet`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {issue.title}
                    </Link>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {issue.description || issue.sourcePath || "No details yet"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={statusVariant(issue.status)}
                      className="rounded-full capitalize"
                    >
                      {formatLabel(issue.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatLabel(issue.issueType)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/org/${organizationSlug}/projects/${encodeURIComponent(issue.projectId)}`}
                      className="text-foreground hover:underline"
                    >
                      {issue.projectName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{issue.targetLocale ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatRelativeTimestamp(issue.updatedAt)}
                  </td>
                </tr>
              ))
            )}
            {isFetchingMore
              ? Array.from({ length: 3 }).map((_, index) => (
                  <IssueRowSkeleton key={`more-${index}`} />
                ))
              : null}
          </tbody>
        </table>
      </div>

      {hasMore && !isLoading ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={onLoadMore}
            disabled={isFetchingMore}
            className="rounded-full"
          >
            {isFetchingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}
