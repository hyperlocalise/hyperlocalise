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
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Copy01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";

import { IssueColumnIconPicker } from "@/components/issue-column-icon/issue-column-icon-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";

import { buildIssueDetailHref } from "../../../../_components/issue-detail/issue-detail-utils";
import { IssueBulkActionBar } from "../../../../_components/issue-bulk-action-bar";
import { IssueGroupedList } from "../../../../_components/issue-grouped-list";
import { IssueListToolbar } from "../../../../_components/issue-list-toolbar";
import { issueListStateToApiQuery } from "../../../../_components/issue-list-url-state";
import { useIssueBulkActions } from "../../../../_components/use-issue-bulk-actions";
import { useIssueListSelection } from "../../../../_components/use-issue-list-selection";
import { useIssueListUrlState } from "../../../../_components/use-issue-list-url-state";
import { issueSheetPageContentMessages as messages } from "./issue-sheet-page-content.messages";
import { issueSheetSharedMessages as sharedMessages } from "./issue-sheet-shared.messages";

import { ProjectPageShell, ProjectSectionHeader } from "../../_components/project-page-shell";
import { useProjectPageQuery } from "../../_components/project-page-shell";
import { IssueSheetCreateIssueDialog } from "./issue-sheet-create-issue-dialog";
import { IssueSheetImportDialog } from "./issue-sheet-import-dialog";
import { useRouter } from "next/navigation";

const columnTypeValues = ["text", "long_text", "select", "user"] as const;
type ColumnTypeValue = (typeof columnTypeValues)[number];

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
  canEditIssues = false,
}: {
  organizationSlug: string;
  projectId: string;
  canEditIssues?: boolean;
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
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "issue-sheet"
      ].$get({
        param: { organizationSlug, projectId },
        query: apiQuery,
      } as never);
      if (response.status !== 200) {
        throw new Error(
          (await readApiResponseError(response, requestFailed)).message || requestFailed,
        );
      }
      return response.json();
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
        identifier: issue.identifier,
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

  const selection = useIssueListSelection(listIssues);
  const filterKey = useMemo(() => JSON.stringify(apiQuery), [apiQuery]);
  const filterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (filterKeyRef.current !== filterKey) {
      filterKeyRef.current = filterKey;
      selection.resetSelectionForFilterChange();
    }
  }, [filterKey, selection.resetSelectionForFilterChange]);

  const { runBulkAction, isPending: isBulkPending } = useIssueBulkActions({
    organizationSlug,
    onSettled: selection.applyBulkResult,
  });

  const bulkIssues = selection.selectedTargets;

  return (
    <ProjectPageShell>
      <div className="space-y-6">
        <ProjectSectionHeader
          icon={Copy01Icon}
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

        {canEditIssues ? (
          <IssueBulkActionBar
            organizationSlug={organizationSlug}
            selectedCount={selection.selectedCount}
            allLoadedSelected={selection.allLoadedSelected}
            selectedProjectIds={selection.selectedProjectIds}
            selectionLimitReached={selection.selectionLimitReached}
            isPending={isBulkPending}
            onSelectAllLoaded={selection.selectAllLoaded}
            onClearSelection={selection.clearSelection}
            onAssign={(assigneeUserId) =>
              runBulkAction({ action: "assign", assigneeUserId, issues: bulkIssues })
            }
            onUnassign={() => runBulkAction({ action: "unassign", issues: bulkIssues })}
            onSetStatus={(status) =>
              runBulkAction({ action: "set_status", status, issues: bulkIssues })
            }
            onSetPriority={(priority) =>
              runBulkAction({ action: "set_priority", priority, issues: bulkIssues })
            }
            onSetIssueType={(issueType) =>
              runBulkAction({ action: "set_issue_type", issueType, issues: bulkIssues })
            }
          />
        ) : null}

        <IssueGroupedList
          organizationSlug={organizationSlug}
          issues={listIssues}
          summary={data?.summary}
          activeStatus={state.status}
          isLoading={issueSheetQuery.isLoading}
          isError={issueSheetQuery.isError}
          selectionEnabled={canEditIssues}
          isIssueSelected={(issue) => selection.isIssueSelected(issue)}
          selectionDisabled={isBulkPending}
          disableInlineEdits={canEditIssues && (selection.someSelected || isBulkPending)}
          onIssueSelectionChange={(issue, checked) => selection.toggleIssue(issue, checked)}
          onIssueActivate={(issue) => {
            router.push(
              buildIssueDetailHref({
                organizationSlug,
                projectId,
                issueId: issue.identifier,
              }),
            );
          }}
          empty={
            <div>
              <TypographyP size="small" weight="medium">
                <FormattedMessage {...messages.emptyTitle} />
              </TypographyP>
              <TypographyP className="mt-1" size="small" tone="subtle">
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
  const [icon, setIcon] = useState<string | null>(null);

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
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "issue-sheet"
      ].columns.$post({
        param: { organizationSlug, projectId },
        json: {
          key: formString(formData, "key"),
          label: formString(formData, "label"),
          type,
          icon,
          config: type === "select" ? { options } : {},
        },
      } as never);
      if (response.status !== 201) {
        throw new Error(
          (await readApiResponseError(response, requestFailed)).message || requestFailed,
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.columnAdded));
      onOpenChange(false);
      setIcon(null);
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setIcon(null);
        }
      }}
    >
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
          <FieldGroup className="flex-row items-start gap-3">
            <div className="flex shrink-0 flex-col items-start gap-1.5">
              <FieldLabel>
                <FormattedMessage {...messages.columnIconLabel} />
              </FieldLabel>
              <IssueColumnIconPicker value={icon} onChange={setIcon} />
            </div>
            <Field className="min-w-0 flex-1 gap-1.5">
              <FieldLabel htmlFor="issue-sheet-column-label">
                <FormattedMessage {...messages.columnLabelField} />
              </FieldLabel>
              <Input
                id="issue-sheet-column-label"
                name="label"
                placeholder={intl.formatMessage(messages.columnLabelPlaceholder)}
                required
              />
            </Field>
          </FieldGroup>
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
