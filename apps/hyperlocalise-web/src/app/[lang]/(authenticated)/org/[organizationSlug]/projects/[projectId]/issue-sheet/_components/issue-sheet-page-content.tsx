"use client";

import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ClipboardListIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
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
import { cn } from "@/lib/primitives/cn";

import { IssueDetailDrawer } from "../../../../_components/issue-detail/issue-detail-drawer";
import {
  isExternalHttpUrl,
  isHttpOrHttpsUrl,
} from "../../../../_components/issue-detail/issue-detail-utils";
import { IssueListFiltersBar } from "../../../../_components/issue-list-filters-bar";
import { issueListStateToApiQuery } from "../../../../_components/issue-list-url-state";
import { useIssueListUrlState } from "../../../../_components/use-issue-list-url-state";
import { useIssueDetailUrl } from "../../../../_components/use-issue-detail-url";
import { issueTypeValues, type IssueTypeValue } from "./issue-sheet-constants";
import { issueSheetPageContentMessages as messages } from "./issue-sheet-page-content.messages";
import { issueSheetSharedMessages as sharedMessages } from "./issue-sheet-shared.messages";

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
  total: number;
  summary: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    wontFix: number;
  };
};

const statusValues = ["open", "in_progress", "resolved", "wont_fix"] as const;
type StatusValue = (typeof statusValues)[number];

const columnTypeValues = ["text", "long_text", "select", "user"] as const;
type ColumnTypeValue = (typeof columnTypeValues)[number];

function issueSheetPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/issue-sheet`;
}

async function readJsonOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const error = await readApiResponseError(response, fallbackMessage);
    throw new Error(error.message || fallbackMessage);
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

function formatUnknownLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusLabel(intl: IntlShape, status: string) {
  switch (status as StatusValue) {
    case "open":
      return intl.formatMessage(sharedMessages.statusOpen);
    case "in_progress":
      return intl.formatMessage(sharedMessages.statusInProgress);
    case "resolved":
      return intl.formatMessage(sharedMessages.statusResolved);
    case "wont_fix":
      return intl.formatMessage(sharedMessages.statusWontFix);
    default:
      return formatUnknownLabel(status);
  }
}

function issueTypeLabel(intl: IntlShape, value: string) {
  switch (value as IssueTypeValue) {
    case "general_question":
      return intl.formatMessage(sharedMessages.issueTypeGeneralQuestion);
    case "translation_mistake":
      return intl.formatMessage(sharedMessages.issueTypeTranslationMistake);
    case "context_request":
      return intl.formatMessage(sharedMessages.issueTypeContextRequest);
    case "source_mistake":
      return intl.formatMessage(sharedMessages.issueTypeSourceMistake);
    case "glossary_violation":
      return intl.formatMessage(sharedMessages.issueTypeGlossaryViolation);
    case "qa_failure":
      return intl.formatMessage(sharedMessages.issueTypeQaFailure);
    default:
      return formatUnknownLabel(value);
  }
}

function columnTypeLabel(intl: IntlShape, value: ColumnTypeValue) {
  switch (value) {
    case "text":
      return intl.formatMessage(sharedMessages.columnTypeText);
    case "long_text":
      return intl.formatMessage(sharedMessages.columnTypeLongText);
    case "select":
      return intl.formatMessage(sharedMessages.columnTypeSelect);
    case "user":
      return intl.formatMessage(sharedMessages.columnTypeUserId);
  }
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

export function IssueSheetPageContent({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  useProjectPageQuery(organizationSlug, projectId);
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { state, searchDraft, setSearchDraft, updateState, clearFilters } = useIssueListUrlState();
  const {
    isOpen: isDetailOpen,
    openIssueDetail,
    closeIssueDetail,
  } = useIssueDetailUrl({
    state,
    updateState,
  });
  const lastFocusedRowRef = useRef<HTMLTableRowElement | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const emptyValue = intl.formatMessage(sharedMessages.emptyValue);
  const requestFailed = intl.formatMessage(messages.requestFailed);

  const statusItems = statusValues.map((value) => ({
    value,
    label: statusLabel(intl, value),
  }));

  const issueTypeItems = issueTypeValues.map((value) => ({
    value,
    label: issueTypeLabel(intl, value),
  }));

  const apiQuery = issueListStateToApiQuery(state);
  const queryKey = ["issue-sheet", organizationSlug, projectId, apiQuery];
  const issueSheetQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams(apiQuery);
      const response = await fetch(`${issueSheetPath(organizationSlug, projectId)}?${params}`);
      return readJsonOrThrow<IssueSheetResponse>(response, requestFailed);
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
      return readJsonOrThrow<{ issue: IssueSheetIssue }>(response, requestFailed);
    },
    onSuccess: refresh,
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.updateFailed),
      ),
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
      return readJsonOrThrow<{ value: unknown }>(response, requestFailed);
    },
    onSuccess: refresh,
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.cellUpdateFailed),
      ),
  });

  const data = issueSheetQuery.data;
  const editableColumns = useMemo(
    () => (data?.columns ?? []).filter((column) => column.layer !== "system"),
    [data?.columns],
  );

  const openIssueRow = (issueId: string, row: HTMLTableRowElement) => {
    lastFocusedRowRef.current = row;
    openIssueDetail({ issueId });
  };

  const handleIssueRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, issueId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openIssueRow(issueId, event.currentTarget);
    }
  };

  const stopRowActivation = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  };

  return (
    <ProjectPageShell>
      <div className="space-y-6">
        <ProjectSectionHeader
          icon={ClipboardListIcon}
          section={intl.formatMessage(messages.sectionTitle)}
          description={intl.formatMessage(messages.sectionDescription)}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                <FormattedMessage {...messages.importCsv} />
              </Button>
              <Button variant="outline" onClick={() => setColumnDialogOpen(true)}>
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
                <FormattedMessage {...messages.column} />
              </Button>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
                <FormattedMessage {...messages.issue} />
              </Button>
            </div>
          }
        />

        <IssueListFiltersBar
          state={state}
          searchDraft={searchDraft}
          onSearchDraftChange={setSearchDraft}
          onStateChange={updateState}
          onClearFilters={clearFilters}
        />

        {data ? (
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              <FormattedMessage {...messages.summaryTotal} values={{ count: data.summary.total }} />
            </Badge>
            <Badge variant="secondary">
              <FormattedMessage {...messages.summaryOpen} values={{ count: data.summary.open }} />
            </Badge>
            <Badge variant="warning">
              <FormattedMessage
                {...messages.summaryInProgress}
                values={{ count: data.summary.inProgress }}
              />
            </Badge>
            <Badge variant="success">
              <FormattedMessage
                {...messages.summaryResolved}
                values={{ count: data.summary.resolved }}
              />
            </Badge>
            <Badge variant="outline">
              <FormattedMessage {...messages.summaryMatching} values={{ count: data.total }} />
            </Badge>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-56 px-4 py-3 font-medium">
                  <FormattedMessage {...messages.columnIssue} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <FormattedMessage {...messages.columnStatus} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <FormattedMessage {...messages.columnType} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <FormattedMessage {...messages.columnLocale} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <FormattedMessage {...messages.columnLink} />
                </th>
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
                    <FormattedMessage {...messages.loadingIssues} />
                  </td>
                </tr>
              ) : issueSheetQuery.isError ? (
                <tr>
                  <td
                    colSpan={5 + editableColumns.length}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    <FormattedMessage {...messages.loadIssuesError} />
                  </td>
                </tr>
              ) : data?.issues.length ? (
                data.issues.map((issue) => (
                  <tr
                    key={issue.id}
                    tabIndex={0}
                    aria-current={state.issue === issue.id ? "true" : undefined}
                    className={cn(
                      "align-top cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      state.issue === issue.id && "bg-muted/40",
                    )}
                    onClick={(event) => openIssueRow(issue.id, event.currentTarget)}
                    onKeyDown={(event) => handleIssueRowKeyDown(event, issue.id)}
                  >
                    <td className="max-w-80 px-4 py-3">
                      <div className="font-medium text-foreground">{issue.title}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {issue.description ||
                          issue.sourceText ||
                          issue.sourcePath ||
                          intl.formatMessage(messages.noDetailsYet)}
                      </div>
                      {issue.key ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          <FormattedMessage {...messages.issueKey} values={{ key: issue.key }} />
                        </div>
                      ) : null}
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={stopRowActivation}
                      onKeyDown={stopRowActivation}
                    >
                      <Select
                        value={issue.status}
                        items={statusItems}
                        onValueChange={(value) =>
                          updateIssue.mutate({ issueId: issue.id, body: { status: value } })
                        }
                      >
                        <SelectTrigger className="w-36">
                          <Badge variant={statusVariant(issue.status)}>
                            {statusLabel(intl, issue.status)}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {statusItems.map((status) => (
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
                    <td
                      className="px-4 py-3"
                      onClick={stopRowActivation}
                      onKeyDown={stopRowActivation}
                    >
                      <Select
                        value={issue.issueType}
                        items={issueTypeItems}
                        onValueChange={(value) =>
                          updateIssue.mutate({ issueId: issue.id, body: { issueType: value } })
                        }
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {issueTypeItems.map((type) => (
                            <SelectItem key={type.value} value={type.value} label={type.label}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {issue.targetLocale ?? emptyValue}
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={stopRowActivation}
                      onKeyDown={stopRowActivation}
                    >
                      <IssueLink
                        organizationSlug={organizationSlug}
                        projectId={projectId}
                        issue={issue}
                        emptyValue={emptyValue}
                      />
                    </td>
                    {editableColumns.map((column) => (
                      <td
                        key={column.id}
                        className="px-4 py-3"
                        onClick={stopRowActivation}
                        onKeyDown={stopRowActivation}
                      >
                        <CustomCell
                          column={column}
                          value={issue.values[column.key]}
                          emptyValue={emptyValue}
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
                      <FormattedMessage {...messages.emptyTitle} />
                    </TypographyP>
                    <TypographyP className="mt-1 text-sm text-muted-foreground">
                      <FormattedMessage {...messages.emptyDescription} />
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
      <IssueDetailDrawer
        organizationSlug={organizationSlug}
        projectId={projectId}
        issueId={state.issue}
        isOpen={isDetailOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeIssueDetail();
          }
        }}
        returnFocusRef={lastFocusedRowRef}
      />
    </ProjectPageShell>
  );
}

function IssueLink({
  organizationSlug,
  projectId,
  issue,
  emptyValue,
}: {
  organizationSlug: string;
  projectId: string;
  issue: IssueSheetIssue;
  emptyValue: string;
}) {
  const intl = useIntl();
  const catHref = buildCatHref(organizationSlug, projectId, issue);
  const safeLinkUrl =
    issue.linkUrl != null && isHttpOrHttpsUrl(issue.linkUrl) ? issue.linkUrl : null;
  const href = safeLinkUrl || catHref;
  if (!href) {
    return <span className="text-muted-foreground">{emptyValue}</span>;
  }
  const openExternalLinkInNewTab = safeLinkUrl != null && isExternalHttpUrl(safeLinkUrl);
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
      {issue.linkLabel ||
        (catHref ? intl.formatMessage(messages.openInCat) : intl.formatMessage(messages.openLink))}
    </Button>
  );
}

function CustomCell({
  column,
  value,
  emptyValue,
  onChange,
}: {
  column: IssueSheetColumn;
  value: unknown;
  emptyValue: string;
  onChange: (value: unknown) => void;
}) {
  const intl = useIntl();
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
          <SelectValue placeholder={emptyValue} />
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
        placeholder={
          column.type === "enrichment"
            ? intl.formatMessage(messages.enrichmentPlaceholder)
            : intl.formatMessage(messages.addNotePlaceholder)
        }
        className="min-h-20 w-64"
      />
    );
  }

  return (
    <Input
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => onChange(draft)}
      placeholder={emptyValue}
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
  const intl = useIntl();
  const requestFailed = intl.formatMessage(messages.requestFailed);

  const columnTypeItems = columnTypeValues.map((value) => ({
    value,
    label: columnTypeLabel(intl, value),
  }));

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
      return readJsonOrThrow<{ column: IssueSheetColumn }>(response, requestFailed);
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.columnAdded));
      onOpenChange(false);
      await onCreated();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.columnCreateFailed),
      ),
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
            <DialogTitle>
              <FormattedMessage {...messages.addColumnTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.addColumnDescription} />
            </DialogDescription>
          </DialogHeader>
          <Input
            name="label"
            placeholder={intl.formatMessage(messages.columnLabelPlaceholder)}
            required
          />
          <Input
            name="key"
            placeholder={intl.formatMessage(messages.columnKeyPlaceholder)}
            required
          />
          <Select name="type" defaultValue="text" items={columnTypeItems}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={intl.formatMessage(messages.columnTypePlaceholder)} />
            </SelectTrigger>
            <SelectContent>
              {columnTypeItems.map((type) => (
                <SelectItem key={type.value} value={type.value} label={type.label}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            name="options"
            placeholder={intl.formatMessage(messages.columnOptionsPlaceholder)}
          />
          <DialogFooter>
            <Button type="submit" disabled={createColumn.isPending}>
              <FormattedMessage {...messages.addColumnSubmit} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
