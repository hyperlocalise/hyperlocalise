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
"use client";
import { useMemo, useState, type FormEvent } from "react";
import { ClipboardListIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";

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
import { TypographyP } from "@/components/ui/typography";
import { readApiResponseError } from "@/lib/api-error";

import { buildIssueDetailHref } from "../../../../_components/issue-detail/issue-detail-utils";
import { IssueGroupedList } from "../../../../_components/issue-grouped-list";
import { IssueListToolbar } from "../../../../_components/issue-list-toolbar";
import { issueListStateToApiQuery } from "../../../../_components/issue-list-url-state";
import { useIssueListUrlState } from "../../../../_components/use-issue-list-url-state";
import { issueSheetPageContentMessages as messages } from "./issue-sheet-page-content.messages";
import { issueSheetSharedMessages as sharedMessages } from "./issue-sheet-shared.messages";

import { ProjectPageShell, ProjectSectionHeader } from "../../_components/project-page-shell";
import { useProjectPageQuery } from "../../_components/project-page-shell";
import { IssueSheetCreateIssueDialog } from "./issue-sheet-create-issue-dialog";
import { IssueSheetImportDialog } from "./issue-sheet-import-dialog";
import { useRouter } from "next/navigation";

type IssueSheetColumn = {
  id: string;
  key: string;
  label: string;
  layer: string;
  type: string;
  config: { options?: { id: string; label: string; color?: string }[] };
  sortOrder: number;
  hidden?: boolean;
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

export function IssueSheetPageContent({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const projectQuery = useProjectPageQuery(organizationSlug, projectId);
  const intl = useIntl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { state, searchDraft, setSearchDraft, updateState, clearFilters } = useIssueListUrlState();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const requestFailed = intl.formatMessage(messages.requestFailed);
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
    await queryClient.invalidateQueries({
      queryKey: ["issue-sheet", organizationSlug, projectId],
    });
  };

  const data = issueSheetQuery.data;
  const listIssues = useMemo(
    () =>
      (data?.issues ?? []).map((issue) => ({
        id: issue.id,
        projectId,
        title: issue.title,
        status: issue.status,
        targetLocale: issue.targetLocale,
        assignee: issue.assignee,
        assigneeUserId: issue.assigneeUserId,
        updatedAt: issue.updatedAt,
        priority: cellString(issue.values.priority) || null,
      })),
    [data?.issues, projectId],
  );

  return (
    <ProjectPageShell>
      <div className="space-y-6">
        <ProjectSectionHeader
          icon={ClipboardListIcon}
          section={intl.formatMessage(messages.sectionTitle)}
          description={intl.formatMessage(messages.sectionDescription)}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => setImportDialogOpen(true)}>
                <FormattedMessage {...messages.importCsv} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setColumnDialogOpen(true)}>
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
                <FormattedMessage {...messages.column} />
              </Button>
              <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
                <FormattedMessage {...messages.issue} />
              </Button>
            </div>
          }
        />

        <IssueListToolbar
          state={state}
          searchDraft={searchDraft}
          onSearchDraftChange={setSearchDraft}
          onStateChange={updateState}
          onClearFilters={clearFilters}
          locales={projectQuery.data?.targetLocales ?? []}
        />

        <IssueGroupedList
          organizationSlug={organizationSlug}
          issues={listIssues}
          summary={data?.summary}
          activeStatus={state.status}
          isLoading={issueSheetQuery.isLoading}
          isError={issueSheetQuery.isError}
          onIssueActivate={(issue) => {
            router.push(
              buildIssueDetailHref({
                organizationSlug,
                projectId,
                issueId: issue.id,
              }),
            );
          }}
          empty={
            <div>
              <TypographyP className="text-sm font-medium">
                <FormattedMessage {...messages.emptyTitle} />
              </TypographyP>
              <TypographyP className="mt-1 text-sm text-muted-foreground">
                <FormattedMessage {...messages.emptyDescription} />
              </TypographyP>
            </div>
          }
          error={<FormattedMessage {...messages.loadIssuesError} />}
        />
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
