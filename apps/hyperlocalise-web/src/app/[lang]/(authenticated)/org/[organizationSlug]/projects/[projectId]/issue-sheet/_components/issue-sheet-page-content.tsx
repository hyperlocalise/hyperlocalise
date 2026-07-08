"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ClipboardListIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TypographyP } from "@/components/ui/typography";
import { readApiResponseError } from "@/lib/api-error";

import { issueTypes } from "./issue-sheet-constants";

import { ProjectPageShell, ProjectSectionHeader } from "../../_components/project-page-shell";
import { useProjectPageQuery } from "../../_components/project-page-shell";
import { IssueSheetCreateIssueDialog } from "./issue-sheet-create-issue-dialog";
import { IssueSheetImportDialog } from "./issue-sheet-import-dialog";

type IssueSheetColumn = {
  id: string;
  key: string;
  label: string;
  layer: string;
  type: string;
  config: { options?: { id: string; label: string; color?: string }[] };
  sortOrder: number;
};

type IssueSheetIssue = {
  id: string;
  title: string;
  description: string;
  issueType: string;
  status: string;
  targetLocale: string | null;
  sourcePath: string | null;
  segmentId: string | null;
  linkKind: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  assigneeUserId: string | null;
  reporter: string | null;
  assignee: string | null;
  key: string | null;
  sourceText: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  values: Record<string, unknown>;
};

type IssueSheetResponse = {
  issues: IssueSheetIssue[];
  columns: IssueSheetColumn[];
  summary: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    wontFix: number;
  };
};

const views = [
  { value: "all_open", label: "All open" },
  { value: "my_work", label: "My work" },
  { value: "qa_triage", label: "QA triage" },
  { value: "source_context", label: "Source & context" },
] as const;

const statuses = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "wont_fix", label: "Won't fix" },
] as const;

const columnTypes = [
  { value: "text", label: "Text" },
  { value: "long_text", label: "Long text" },
  { value: "select", label: "Select" },
  { value: "user", label: "User ID" },
] as const;

function issueSheetPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/issue-sheet`;
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await readApiResponseError(response, "Request failed");
    throw new Error(error.message || "Request failed");
  }
  return (await response.json()) as T;
}

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" ? value : fallback;
}

function cellString(value: unknown) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value) ?? "";
}

function formatLabel(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusVariant(status: string) {
  if (status === "resolved") return "success";
  if (status === "wont_fix") return "outline";
  if (status === "in_progress") return "warning";
  return "secondary";
}

function buildCatHref(organizationSlug: string, projectId: string, issue: IssueSheetIssue) {
  if (!issue.sourcePath || !issue.targetLocale) {
    return null;
  }
  const params = new URLSearchParams({
    sourcePath: issue.sourcePath,
    locale: issue.targetLocale,
  });
  if (issue.segmentId) {
    params.set("segment", issue.segmentId);
  }
  return `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/files/cat?${params.toString()}`;
}

function isExternalHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.origin !== window.location.origin
    );
  } catch {
    return false;
  }
}

export function IssueSheetPageContent({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  useProjectPageQuery(organizationSlug, projectId);
  const queryClient = useQueryClient();
  const [view, setView] = useState<(typeof views)[number]["value"]>("all_open");
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const queryKey = ["issue-sheet", organizationSlug, projectId, view, search];
  const issueSheetQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ view });
      if (search.trim()) {
        params.set("search", search.trim());
      }
      const response = await fetch(`${issueSheetPath(organizationSlug, projectId)}?${params}`);
      return readJsonOrThrow<IssueSheetResponse>(response);
    },
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["issue-sheet", organizationSlug, projectId] });
  };

  const updateIssue = useMutation({
    mutationFn: async ({ issueId, body }: { issueId: string; body: Record<string, unknown> }) => {
      const response = await fetch(`${issueSheetPath(organizationSlug, projectId)}/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return readJsonOrThrow<{ issue: IssueSheetIssue }>(response);
    },
    onSuccess: refresh,
    onError: (error) => toast.error(error instanceof Error ? error.message : "Update failed"),
  });

  const setValue = useMutation({
    mutationFn: async ({
      issueId,
      columnKey,
      value,
    }: {
      issueId: string;
      columnKey: string;
      value: unknown;
    }) => {
      const response = await fetch(
        `${issueSheetPath(organizationSlug, projectId)}/${issueId}/values`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columnKey, value }),
        },
      );
      return readJsonOrThrow<{ value: unknown }>(response);
    },
    onSuccess: refresh,
    onError: (error) => toast.error(error instanceof Error ? error.message : "Cell update failed"),
  });

  const data = issueSheetQuery.data;
  const editableColumns = useMemo(
    () => (data?.columns ?? []).filter((column) => column.layer !== "system"),
    [data?.columns],
  );

  return (
    <ProjectPageShell>
      <div className="space-y-6">
        <ProjectSectionHeader
          icon={ClipboardListIcon}
          section="Issue Sheet"
          description="Track localization issues in Hyperlocalise, then link rows to CAT segments, native issues, provider threads, or external context."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                Import CSV
              </Button>
              <Button variant="outline" onClick={() => setColumnDialogOpen(true)}>
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
                Column
              </Button>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
                Issue
              </Button>
            </div>
          }
        />

        <div className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-[220px_1fr]">
          <Select
            value={view}
            items={views}
            onValueChange={(value) => setView((value ?? "all_open") as typeof view)}
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
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search title, description, or source path"
          />
        </div>

        {data ? (
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{data.summary.total} total</Badge>
            <Badge variant="secondary">{data.summary.open} open</Badge>
            <Badge variant="warning">{data.summary.inProgress} in progress</Badge>
            <Badge variant="success">{data.summary.resolved} resolved</Badge>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-56 px-4 py-3 font-medium">Issue</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Locale</th>
                <th className="px-4 py-3 font-medium">Link</th>
                {editableColumns.map((column) => (
                  <th key={column.id} className="min-w-40 px-4 py-3 font-medium">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {issueSheetQuery.isLoading ? (
                <tr>
                  <td
                    colSpan={5 + editableColumns.length}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    Loading issues...
                  </td>
                </tr>
              ) : issueSheetQuery.isError ? (
                <tr>
                  <td
                    colSpan={5 + editableColumns.length}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    Issues could not be loaded.
                  </td>
                </tr>
              ) : data?.issues.length ? (
                data.issues.map((issue) => (
                  <tr key={issue.id} className="align-top">
                    <td className="max-w-80 px-4 py-3">
                      <div className="font-medium text-foreground">{issue.title}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {issue.description ||
                          issue.sourceText ||
                          issue.sourcePath ||
                          "No details yet"}
                      </div>
                      {issue.key ? (
                        <div className="mt-2 text-xs text-muted-foreground">Key: {issue.key}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={issue.status}
                        items={statuses}
                        onValueChange={(value) =>
                          updateIssue.mutate({ issueId: issue.id, body: { status: value } })
                        }
                      >
                        <SelectTrigger className="w-36">
                          <Badge variant={statusVariant(issue.status)}>
                            {formatLabel(issue.status)}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {statuses.map((status) => (
                            <SelectItem
                              key={status.value}
                              value={status.value}
                              label={status.label}
                            >
                              {status.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={issue.issueType}
                        items={issueTypes}
                        onValueChange={(value) =>
                          updateIssue.mutate({ issueId: issue.id, body: { issueType: value } })
                        }
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {issueTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value} label={type.label}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{issue.targetLocale ?? "—"}</td>
                    <td className="px-4 py-3">
                      <IssueLink
                        organizationSlug={organizationSlug}
                        projectId={projectId}
                        issue={issue}
                      />
                    </td>
                    {editableColumns.map((column) => (
                      <td key={column.id} className="px-4 py-3">
                        <CustomCell
                          column={column}
                          value={issue.values[column.key]}
                          onChange={(value) =>
                            setValue.mutate({ issueId: issue.id, columnKey: column.key, value })
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5 + editableColumns.length} className="px-4 py-12 text-center">
                    <TypographyP className="text-sm font-medium">
                      No issues in this view.
                    </TypographyP>
                    <TypographyP className="mt-1 text-sm text-muted-foreground">
                      Add an issue manually or from CAT to start tracking team context.
                    </TypographyP>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <IssueSheetCreateIssueDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        organizationSlug={organizationSlug}
        projectId={projectId}
        onCreated={refresh}
      />
      <CreateColumnDialog
        open={columnDialogOpen}
        onOpenChange={setColumnDialogOpen}
        organizationSlug={organizationSlug}
        projectId={projectId}
        onCreated={refresh}
      />
      <IssueSheetImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        organizationSlug={organizationSlug}
        projectId={projectId}
        columns={data?.columns ?? []}
        onImported={refresh}
      />
    </ProjectPageShell>
  );
}

function IssueLink({
  organizationSlug,
  projectId,
  issue,
}: {
  organizationSlug: string;
  projectId: string;
  issue: IssueSheetIssue;
}) {
  const catHref = buildCatHref(organizationSlug, projectId, issue);
  const href = issue.linkUrl || catHref;
  if (!href) {
    return <span className="text-muted-foreground">—</span>;
  }
  const openExternalLinkInNewTab = issue.linkUrl != null && isExternalHttpUrl(issue.linkUrl);
  return (
    <Button
      variant="link"
      className="h-auto p-0"
      render={
        <a
          href={href}
          {...(openExternalLinkInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        />
      }
    >
      {issue.linkLabel || (catHref ? "Open in CAT" : "Open link")}
    </Button>
  );
}

function CustomCell({
  column,
  value,
  onChange,
}: {
  column: IssueSheetColumn;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [draft, setDraft] = useState(cellString(value));

  if (column.type === "select") {
    const options = column.config.options ?? [];
    const selectItems = options.map((option) => ({ value: option.id, label: option.label }));
    return (
      <Select
        value={draft || undefined}
        items={selectItems}
        onValueChange={(next) => {
          const value = next ?? "";
          setDraft(value);
          onChange(value);
        }}
      >
        <SelectTrigger className="w-32">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id} label={option.label}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (column.type === "long_text" || column.type === "enrichment") {
    return (
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => onChange(draft)}
        placeholder={column.type === "enrichment" ? "Run context later" : "Add note"}
        className="min-h-20 w-64"
      />
    );
  }

  return (
    <Input
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => onChange(draft)}
      placeholder="—"
      className="w-44"
    />
  );
}

function CreateColumnDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId: string;
  onCreated: () => Promise<void>;
}) {
  const createColumn = useMutation({
    mutationFn: async (formData: FormData) => {
      const type = formString(formData, "type", "text");
      const rawOptions = formString(formData, "options");
      const options = rawOptions
        .split(",")
        .map((option) => option.trim())
        .filter(Boolean)
        .map((option) => ({ id: option, label: option }));
      const response = await fetch(`${issueSheetPath(organizationSlug, projectId)}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: formString(formData, "key"),
          label: formString(formData, "label"),
          type,
          config: type === "select" ? { options } : {},
        }),
      });
      return readJsonOrThrow<{ column: IssueSheetColumn }>(response);
    },
    onSuccess: async () => {
      toast.success("Column added");
      onOpenChange(false);
      await onCreated();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Column create failed"),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createColumn.mutate(new FormData(event.currentTarget));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add column</DialogTitle>
            <DialogDescription>
              Add a project-specific workflow column to the Issue Sheet.
            </DialogDescription>
          </DialogHeader>
          <Input name="label" placeholder="Column label, e.g. Sprint" required />
          <Input name="key" placeholder="column_key" required />
          <Select name="type" defaultValue="text" items={columnTypes}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Column type" />
            </SelectTrigger>
            <SelectContent>
              {columnTypes.map((type) => (
                <SelectItem key={type.value} value={type.value} label={type.label}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input name="options" placeholder="For select: Backlog, Sprint 24, Blocked" />
          <DialogFooter>
            <Button type="submit" disabled={createColumn.isPending}>
              Add column
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
