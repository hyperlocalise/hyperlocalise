"use client";

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
import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { observer } from "mobx-react-lite";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  FileIcon,
  FlagIcon,
  TranslateIcon,
  ArrowSquareOutIcon,
  DotsThreeCircleIcon,
  TagIcon,
  UserIcon,
  type Icon,
} from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TypographyP } from "@/components/ui/typography";
import {
  IssueColumnIcon,
  resolveIssueSheetColumnIcon,
} from "@/components/issue-column-icon/issue-column-icon";
import { issueSheetTemplateLabel } from "@/lib/projects/issue-sheet/issue-sheet-templates";
import { cn } from "@/lib/primitives/cn";

import { IssueCustomColumnField } from "./issue-custom-column-field";
import { IssueMarkdownField } from "./issue-markdown-field";
import { issueMarkdownFieldMessages as markdownFieldMessages } from "./issue-markdown-field.messages";
import { IssueAssigneePicker } from "./issue-assignee-picker";
import { IssueCommentThread } from "./issue-comment-thread";
import { IssueDuplicateBanner } from "./issue-duplicate-banner";
import {
  buildIssueCatHref,
  isExternalHttpUrl,
  isHttpOrHttpsUrl,
  issuePriorityValues,
  issueStatusLabel,
  issueStatusValues,
  issueTypeLabel,
  issueTypeValues,
  linkKindLabel,
} from "./issue-detail-utils";
import { IssueLocalePicker } from "./issue-locale-picker";
import { IssueSourcePathPicker } from "./issue-source-path-picker";
import { IssuePriorityIcon } from "./issue-priority-icon";
import { IssueRelationshipSection } from "./issue-relationship-section";
import { IssueStatusIcon } from "./issue-status-icon";
import {
  customColumnValueFromIssue,
  isIssueSheetColumnVisible,
  isMainContentCustomColumn,
  isSidebarCustomColumn,
  listDetailPanelColumns,
} from "./issue-sheet-column-utils";
import { ownerNoteFromIssue } from "./store/issue-detail-draft-store";
import {
  IssueDetailDraftStoreProvider,
  useIssueDetailDraftStore,
} from "./store/issue-detail-draft-store-context";
import { IssueTypePicker, type IssueTypeValue } from "./issue-type-picker";
import { IssueWatchControl } from "./issue-watch-control";
import { useAssignableIssueMembersQuery } from "./use-assignable-issue-members";
import { useIssueDetailMutations } from "./use-issue-detail-mutations";
import { useIssueDetailQuery } from "./use-issue-detail-query";
import { useIssueRelationshipsQuery } from "./use-issue-relationships-query";
import { useIssueSheetColumnsQuery } from "./use-issue-sheet-columns-query";
import { issueDetailPanelMessages as messages } from "./issue-detail-panel.messages";
import { type IssueDetailSidebarScope } from "./issue-detail-sidebar-state";
import { useIssueDetailSidebarOpen } from "./use-issue-detail-sidebar-open";
import { issueSheetSharedMessages as sharedMessages } from "../../projects/[projectId]/issue-sheet/_components/issue-sheet-shared.messages";
import { useProjectPageQuery } from "../../projects/[projectId]/_components/project-page-shell";
import {
  issueContentFieldClassName,
  issuePropertyControlClassName,
} from "./issue-property-control";

type PropertyIcon = Icon;

export type IssueDetailPanelHandle = {
  isDirty: () => boolean;
  savePending: () => Promise<void>;
  beginCloseConfirm: () => void;
  endCloseConfirm: () => void;
  discardPending: () => void;
};

function PropertyRow({
  icon,
  label,
  children,
  interactive = true,
}: {
  icon: PropertyIcon;
  label: ReactNode;
  children: ReactNode;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "-mx-1 flex min-h-9 items-center gap-2 rounded-md px-1",
        interactive && "hover:bg-accent",
      )}
    >
      <dt className="flex w-[7.5rem] shrink-0 items-center gap-2 text-sm text-muted-foreground">
        {createElement(icon, { className: "size-3.5 shrink-0" })}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function ReadOnlyValue({
  value,
  empty,
  className,
}: {
  value: string | null;
  empty: string;
  className?: string;
}) {
  return (
    <TypographyP className={cn("leading-5", className)} size="small" tone="content">
      {value?.trim() ? value : empty}
    </TypographyP>
  );
}

function LinkedContextRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function IssueDetailSkeleton() {
  return (
    <div className="grid h-full min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden md:grid-cols-[minmax(0,1fr)_22rem] md:grid-rows-none">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-5">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-t border-border bg-muted/20 px-4 py-5 md:border-t-0 md:border-s">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="ml-auto h-7 w-24" />
        <Skeleton className="ml-auto h-7 w-20" />
        <Skeleton className="ml-auto h-7 w-28" />
        <Skeleton className="ml-auto h-7 w-16" />
        <Skeleton className="mt-2 ml-auto h-7 w-24" />
      </aside>
    </div>
  );
}

const iconRailSelectTriggerClassName =
  "size-8 justify-center border-transparent bg-transparent p-0 shadow-none hover:bg-accent focus-visible:border-ring";

type IssueDetailPanelProps = {
  organizationSlug: string;
  projectId: string;
  issueId: string;
  onDirtyChange?: (dirty: boolean) => void;
  onDeleted?: () => void;
  canDelete?: boolean;
  defaultSidebarOpen?: boolean;
  sidebarStorageScope?: IssueDetailSidebarScope;
};

export const IssueDetailPanel = forwardRef<IssueDetailPanelHandle, IssueDetailPanelProps>(
  function IssueDetailPanel(props, ref) {
    return (
      <IssueDetailDraftStoreProvider issueId={props.issueId}>
        <IssueDetailPanelView {...props} ref={ref} />
      </IssueDetailDraftStoreProvider>
    );
  },
);

const IssueDetailPanelView = observer(
  forwardRef<IssueDetailPanelHandle, IssueDetailPanelProps>(function IssueDetailPanelView(
    {
      organizationSlug,
      projectId,
      issueId,
      onDirtyChange,
      onDeleted,
      canDelete = false,
      defaultSidebarOpen = true,
      sidebarStorageScope = "issue-detail",
    },
    ref,
  ) {
    const intl = useIntl();
    const emptyValue = intl.formatMessage(sharedMessages.emptyValue);
    const issueQuery = useIssueDetailQuery({
      organizationSlug,
      projectId,
      issueId,
    });
    const columnsQuery = useIssueSheetColumnsQuery({
      organizationSlug,
      projectId,
    });
    const projectQuery = useProjectPageQuery(organizationSlug, projectId);
    const assignableMembersQuery = useAssignableIssueMembersQuery({
      organizationSlug,
      projectId,
    });
    const relationshipsQuery = useIssueRelationshipsQuery({
      organizationSlug,
      projectId,
      issueId,
    });
    const relationships = relationshipsQuery.data ?? [];
    const actorUserId = assignableMembersQuery.data?.members.find(
      (member) => member.isCurrentUser,
    )?.userId;

    const { updateIssue, setValue, deleteIssue, cancelPending } = useIssueDetailMutations({
      organizationSlug,
      projectId,
      issueId,
      actorUserId,
      onSaved: () => toast.success(intl.formatMessage(messages.saved)),
      onDeleted,
    });

    const issue = issueQuery.data;
    const draftStore = useIssueDetailDraftStore();
    const titleDraft = draftStore.titleDraft;
    const descriptionDraft = draftStore.descriptionDraft;
    const ownerNoteDraft = draftStore.ownerNoteDraft;
    const customColumnDrafts = draftStore.customColumnDrafts;
    const isDeleteOpen = draftStore.isDeleteOpen;
    const [sidebarOpen, setSidebarOpen] = useIssueDetailSidebarOpen(
      sidebarStorageScope,
      issueId,
      defaultSidebarOpen,
    );
    const isSaving = updateIssue.isPending || setValue.isPending || deleteIssue.isPending;

    const issueRef = useRef(issue);
    const detailColumnsRef = useRef<ReturnType<typeof listDetailPanelColumns>>([]);
    issueRef.current = issue;

    const detailColumns = useMemo(
      () => listDetailPanelColumns(columnsQuery.data ?? []),
      [columnsQuery.data],
    );
    detailColumnsRef.current = detailColumns;
    const columns = columnsQuery.data ?? [];
    const showPriorityField = isIssueSheetColumnVisible(columns, "priority");
    const showOwnerNoteField = isIssueSheetColumnVisible(columns, "owner_note");

    useEffect(() => {
      draftStore.syncIssue(issue);
    }, [draftStore, issue]);

    useEffect(() => {
      draftStore.syncCustomColumns(issue, detailColumns);
    }, [draftStore, issue, detailColumns]);

    useEffect(() => {
      if (!onDirtyChange) {
        return;
      }
      onDirtyChange(draftStore.reportDirty(issue, detailColumns));
    }, [
      draftStore,
      issue,
      titleDraft,
      descriptionDraft,
      ownerNoteDraft,
      customColumnDrafts,
      detailColumns,
      onDirtyChange,
    ]);

    useImperativeHandle(ref, () => ({
      isDirty: () => draftStore.isHandleDirty(issueRef.current, detailColumnsRef.current),
      beginCloseConfirm: () => {
        draftStore.beginCloseConfirm();
      },
      endCloseConfirm: () => {
        draftStore.endCloseConfirm();
      },
      discardPending: () => {
        cancelPending();
        const current = issueRef.current;
        if (current) {
          draftStore.discardCustomColumnDrafts(current, detailColumnsRef.current);
        } else {
          draftStore.beginCloseConfirm();
        }
      },
      savePending: async () => {
        const current = issueRef.current;
        if (!current) {
          return;
        }

        const plan = draftStore.buildSavePlan(current, detailColumnsRef.current);
        if (!plan.ok) {
          toast.error(intl.formatMessage(messages.titleRequired));
          throw new Error(plan.error);
        }

        if (Object.keys(plan.issueUpdates).length > 0) {
          await updateIssue.mutateAsync(plan.issueUpdates);
        }
        if (plan.ownerNote !== null) {
          await setValue.mutateAsync({
            columnKey: "owner_note",
            value: plan.ownerNote,
          });
        }
        for (const column of plan.customColumns) {
          await setValue.mutateAsync(column);
        }
      },
    }));

    const statusItems = useMemo(
      () =>
        issueStatusValues.map((value) => ({
          value,
          label: issueStatusLabel(intl, value),
        })),
      [intl],
    );

    const priorityItems = useMemo(
      () => issuePriorityValues.map((value) => ({ value, label: value })),
      [],
    );

    const typeItems = useMemo(
      () =>
        issueTypeValues.map((value) => ({
          value,
          label: issueTypeLabel(intl, value),
        })),
      [intl],
    );

    const sidebarCustomColumns = useMemo(
      () => detailColumns.filter(isSidebarCustomColumn),
      [detailColumns],
    );
    const mainCustomColumns = useMemo(
      () => detailColumns.filter(isMainContentCustomColumn),
      [detailColumns],
    );

    const saveCustomColumnValue = (columnKey: string, value: unknown) => {
      if (draftStore.suppressAutoSave) {
        return;
      }
      setValue.mutate({ columnKey, value });
    };

    const saveCustomColumnDraft = (columnKey: string) => {
      if (draftStore.suppressAutoSave) {
        return;
      }
      const current = issueRef.current;
      if (!current) {
        return;
      }
      const draft = draftStore.customColumnDrafts[columnKey];
      if (draft === undefined) {
        return;
      }
      if (draft === customColumnValueFromIssue(current, columnKey)) {
        return;
      }
      setValue.mutate({ columnKey, value: draft });
    };

    const showCustomColumns = columnsQuery.isSuccess;

    if (issueQuery.isLoading) {
      return (
        <div aria-busy="true" aria-live="polite" className="flex min-h-0 flex-1 flex-col">
          <TypographyP className="sr-only">
            <FormattedMessage {...messages.loading} />
          </TypographyP>
          <IssueDetailSkeleton />
        </div>
      );
    }

    if (issueQuery.isError) {
      return (
        <div className="px-6 py-5">
          <TypographyP size="small" tone="critical">
            <FormattedMessage {...messages.loadError} />
          </TypographyP>
        </div>
      );
    }

    if (!issue) {
      return (
        <div className="px-6 py-5">
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.notFound} />
          </TypographyP>
        </div>
      );
    }

    const contentEditorHref = buildIssueCatHref(organizationSlug, projectId, issue);
    const showExternalLink = Boolean(
      issue.linkUrl && issue.linkUrl !== contentEditorHref && isHttpOrHttpsUrl(issue.linkUrl),
    );
    const sidebarToggleLabel = intl.formatMessage(
      sidebarOpen ? messages.collapseSidebar : messages.expandSidebar,
    );
    const priority = typeof issue.values.priority === "string" ? issue.values.priority : "";
    const hasLinkedContext = Boolean(
      issue.translationKeyId || issue.key || issue.sourceText || issue.segmentId || issue.linkKind,
    );

    const saveTitle = () => {
      if (draftStore.suppressAutoSave) {
        return;
      }
      const next = titleDraft.trim();
      if (!next || next === issue.title) {
        return;
      }
      updateIssue.mutate({ title: next });
    };

    const saveDescription = () => {
      if (draftStore.suppressAutoSave) {
        return;
      }
      if (descriptionDraft === issue.description) {
        return;
      }
      updateIssue.mutate({ description: descriptionDraft });
    };

    const saveOwnerNote = () => {
      if (draftStore.suppressAutoSave) {
        return;
      }
      const current = ownerNoteFromIssue(issue);
      if (ownerNoteDraft === current) {
        return;
      }
      setValue.mutate({ columnKey: "owner_note", value: ownerNoteDraft });
    };

    const confirmDelete = async () => {
      cancelPending();
      await deleteIssue.mutateAsync();
      draftStore.setDeleteOpen(false);
    };

    return (
      <>
        <div
          className={cn(
            "grid h-full min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden lg:grid-rows-none",
            sidebarOpen
              ? "lg:grid-cols-[minmax(0,1fr)_22rem]"
              : "lg:grid-cols-[minmax(0,1fr)_3rem]",
          )}
          aria-busy={isSaving}
        >
          <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto px-6 py-5">
            <IssueDuplicateBanner
              organizationSlug={organizationSlug}
              relationships={relationships}
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="font-mono text-xs text-muted-foreground tabular-nums hover:text-foreground"
                onClick={() => {
                  void navigator.clipboard.writeText(issue.identifier);
                  toast.success(intl.formatMessage(messages.copiedIssueId));
                }}
              >
                {issue.identifier}
              </button>
              {canDelete ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={intl.formatMessage(messages.queryActions)}
                        disabled={isSaving}
                      />
                    }
                  >
                    <DotsThreeCircleIcon className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-40">
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={isSaving}
                      onClick={() => draftStore.setDeleteOpen(true)}
                    >
                      <FormattedMessage {...messages.deleteQuery} />
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
            <Textarea
              value={titleDraft}
              onChange={(event) => draftStore.setTitleDraft(event.currentTarget.value)}
              onBlur={saveTitle}
              disabled={isSaving}
              aria-label={intl.formatMessage(messages.fieldTitle)}
              rows={1}
              className={cn(
                issueContentFieldClassName,
                "min-h-10 shrink-0 overflow-hidden text-lg font-semibold md:min-h-10 md:text-xl",
              )}
            />

            <IssueMarkdownField
              key={`${issue.id}-description`}
              value={descriptionDraft}
              onChange={(value) => draftStore.setDescriptionDraft(value)}
              onCommit={saveDescription}
              disabled={isSaving}
              placeholder={intl.formatMessage(messages.fieldDescription)}
              emptyMessage={intl.formatMessage(markdownFieldMessages.emptyDescription)}
              ariaLabel={intl.formatMessage(messages.fieldDescription)}
              imageUpload={{ organizationSlug, projectId }}
            />

            {showOwnerNoteField ? (
              <section className="mt-2 grid gap-2 border-t border-border pt-4">
                <TypographyP size="small" weight="medium" tone="content">
                  <FormattedMessage {...messages.fieldOwnerNote} />
                </TypographyP>
                <IssueMarkdownField
                  key={`${issue.id}-owner-note`}
                  value={ownerNoteDraft}
                  onChange={(value) => draftStore.setOwnerNoteDraft(value)}
                  onCommit={saveOwnerNote}
                  disabled={isSaving}
                  placeholder={intl.formatMessage(messages.fieldOwnerNotePlaceholder)}
                  emptyMessage={intl.formatMessage(markdownFieldMessages.emptyOwnerNote)}
                  ariaLabel={intl.formatMessage(messages.fieldOwnerNote)}
                  imageUpload={{ organizationSlug, projectId }}
                />
              </section>
            ) : null}

            {showCustomColumns
              ? mainCustomColumns.map((column) => (
                  <section key={column.id} className="mt-2 grid gap-2 border-t border-border pt-4">
                    <TypographyP
                      className="inline-flex items-center gap-1.5"
                      size="small"
                      weight="medium"
                      tone="content"
                    >
                      <IssueColumnIcon iconId={column.icon} className="text-muted-foreground" />
                      {column.label}
                    </TypographyP>
                    <IssueCustomColumnField
                      column={column}
                      value={issue.values[column.key]}
                      draft={customColumnDrafts[column.key] ?? ""}
                      emptyValue={emptyValue}
                      disabled={isSaving}
                      variant="main"
                      members={assignableMembersQuery.data?.members ?? []}
                      membersLoading={assignableMembersQuery.isLoading}
                      imageUpload={{ organizationSlug, projectId }}
                      onDraftChange={(value) => draftStore.setCustomColumnDraft(column.key, value)}
                      onCommit={() => saveCustomColumnDraft(column.key)}
                      onChange={(value) => saveCustomColumnValue(column.key, value)}
                    />
                  </section>
                ))
              : null}

            {hasLinkedContext ? (
              <section className="mt-2 grid gap-3 border-t border-border pt-4">
                <div className="flex items-center justify-between gap-2">
                  <TypographyP
                    className="inline-flex items-center gap-1.5"
                    size="small"
                    weight="medium"
                    tone="content"
                  >
                    <ArrowSquareOutIcon className="size-3.5 text-muted-foreground" />
                    <FormattedMessage {...messages.linkedContext} />
                  </TypographyP>
                  {issue.translationKeyId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isSaving}
                      onClick={() => {
                        updateIssue.mutate(
                          { translationKeyId: null },
                          {
                            onSuccess: () => {
                              toast.success(intl.formatMessage(messages.stringUnlinked));
                            },
                          },
                        );
                      }}
                    >
                      <FormattedMessage {...messages.unlinkString} />
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-3">
                  {issue.key ? (
                    <LinkedContextRow label={<FormattedMessage {...messages.fieldKey} />}>
                      <ReadOnlyValue value={issue.key} empty={emptyValue} />
                    </LinkedContextRow>
                  ) : null}
                  {issue.segmentId ? (
                    <LinkedContextRow label={<FormattedMessage {...messages.fieldSegmentId} />}>
                      <ReadOnlyValue value={issue.segmentId} empty={emptyValue} />
                    </LinkedContextRow>
                  ) : null}
                  {issue.sourceText ? (
                    <LinkedContextRow label={<FormattedMessage {...messages.fieldSourceText} />}>
                      <ReadOnlyValue value={issue.sourceText} empty={emptyValue} />
                    </LinkedContextRow>
                  ) : null}
                  {issue.linkKind ? (
                    <LinkedContextRow label={<FormattedMessage {...messages.fieldLink} />}>
                      <ReadOnlyValue
                        value={linkKindLabel(intl, issue.linkKind)}
                        empty={emptyValue}
                      />
                    </LinkedContextRow>
                  ) : null}
                </div>
              </section>
            ) : null}

            <IssueRelationshipSection
              organizationSlug={organizationSlug}
              projectId={projectId}
              issueId={issue.id}
              relationships={relationships}
              isLoading={relationshipsQuery.isLoading}
              isError={relationshipsQuery.isError}
              disabled={isSaving}
            />

            <IssueWatchControl
              organizationSlug={organizationSlug}
              projectId={projectId}
              issueId={issue.id}
              isWatching={issue.isWatching}
              disabled={isSaving}
            />

            <IssueCommentThread
              organizationSlug={organizationSlug}
              projectId={projectId}
              issueId={issue.id}
            />
          </div>

          <Collapsible
            open={sidebarOpen}
            onOpenChange={setSidebarOpen}
            className="flex min-h-0 flex-col overflow-hidden border-t border-border bg-muted/20 md:border-t-0 md:border-s"
          >
            <aside
              className={cn(
                "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto",
                sidebarOpen ? "px-4 py-5" : "px-4 py-5 lg:items-center lg:px-1.5 lg:py-3",
              )}
            >
              {sidebarOpen ? (
                <div className="mb-4 flex flex-col gap-2">
                  <div className="flex items-stretch gap-2">
                    {contentEditorHref ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-w-0 flex-1 justify-start"
                        render={
                          <a href={contentEditorHref} target="_blank" rel="noopener noreferrer" />
                        }
                      >
                        <TranslateIcon data-icon="inline-start" />
                        <FormattedMessage {...messages.openInContentEditor} />
                      </Button>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center rounded-lg border border-dashed border-border px-3 py-2">
                        <TypographyP size="xsmall" tone="subtle">
                          <FormattedMessage {...messages.openInContentEditorUnavailable} />
                        </TypographyP>
                      </div>
                    )}
                    <CollapsibleTrigger
                      className="hidden shrink-0 lg:flex"
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label={sidebarToggleLabel}
                          title={sidebarToggleLabel}
                        />
                      }
                    >
                      <ArrowRightIcon className="size-4 rtl:rotate-180" />
                    </CollapsibleTrigger>
                  </div>
                  {showExternalLink && issue.linkUrl ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      render={
                        <a
                          href={issue.linkUrl}
                          {...(isExternalHttpUrl(issue.linkUrl)
                            ? { target: "_blank", rel: "noopener noreferrer" }
                            : {})}
                        />
                      }
                    >
                      <ArrowSquareOutIcon data-icon="inline-start" />
                      {issue.linkLabel || intl.formatMessage(messages.openLink)}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className={cn("flex flex-col gap-1", !sidebarOpen && "lg:hidden")}>
                {columnsQuery.isError ? (
                  <div className="mb-3 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <TypographyP size="xsmall" tone="critical">
                      <FormattedMessage {...messages.loadColumnsError} />
                    </TypographyP>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={columnsQuery.isFetching}
                      onClick={() => void columnsQuery.refetch()}
                    >
                      <FormattedMessage {...messages.retryColumns} />
                    </Button>
                  </div>
                ) : null}

                <dl className="flex flex-col">
                  <PropertyRow
                    icon={UserIcon}
                    label={<FormattedMessage {...messages.fieldAssignee} />}
                  >
                    <IssueAssigneePicker
                      value={issue.assigneeUserId}
                      currentLabel={issue.assignee}
                      members={assignableMembersQuery.data?.members ?? []}
                      isLoading={assignableMembersQuery.isLoading}
                      disabled={isSaving}
                      size="ghost"
                      triggerClassName={issuePropertyControlClassName}
                      onChange={(assigneeUserId) => {
                        updateIssue.mutate({ assigneeUserId });
                      }}
                    />
                  </PropertyRow>

                  <PropertyRow
                    icon={CheckCircleIcon}
                    label={<FormattedMessage {...messages.fieldStatus} />}
                  >
                    <Select
                      value={issue.status}
                      items={statusItems}
                      onValueChange={(value) => {
                        if (value) {
                          updateIssue.mutate({ status: value });
                        }
                      }}
                      disabled={isSaving}
                    >
                      <SelectTrigger
                        aria-label={intl.formatMessage(messages.fieldStatus)}
                        className={issuePropertyControlClassName}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <IssueStatusIcon status={issue.status} className="size-3.5" />
                          <span className="truncate">{issueStatusLabel(intl, issue.status)}</span>
                        </span>
                      </SelectTrigger>
                      <SelectContent className="min-w-44 p-1.5">
                        {statusItems.map((status) => (
                          <SelectItem
                            key={status.value}
                            value={status.value}
                            label={status.label}
                            className="rounded-lg px-2 py-1.5 focus:bg-muted! focus:text-foreground! data-highlighted:bg-muted! data-highlighted:text-foreground!"
                          >
                            <span className="flex items-center gap-2">
                              <IssueStatusIcon status={status.value} className="size-3.5" />
                              {status.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </PropertyRow>

                  <PropertyRow icon={TagIcon} label={<FormattedMessage {...messages.fieldType} />}>
                    <IssueTypePicker
                      value={issue.issueType as IssueTypeValue}
                      onValueChange={(value) => {
                        updateIssue.mutate({ issueType: value });
                      }}
                      disabled={isSaving}
                      appearance="plain"
                      aria-label={intl.formatMessage(messages.fieldType)}
                      triggerClassName={issuePropertyControlClassName}
                    />
                  </PropertyRow>

                  {showPriorityField ? (
                    <PropertyRow
                      icon={FlagIcon}
                      label={<FormattedMessage {...messages.fieldPriority} />}
                    >
                      <Select
                        value={priority || null}
                        items={priorityItems}
                        onValueChange={(value) => {
                          if (value) {
                            setValue.mutate({ columnKey: "priority", value });
                          }
                        }}
                        disabled={isSaving}
                      >
                        <SelectTrigger
                          aria-label={intl.formatMessage(messages.fieldPriority)}
                          className={issuePropertyControlClassName}
                        >
                          {priority ? (
                            <span className="flex min-w-0 items-center gap-2">
                              <IssuePriorityIcon priority={priority} size="sm" />
                              <span className="truncate">
                                {priorityItems.find((item) => item.value === priority)?.label ??
                                  priority}
                              </span>
                            </span>
                          ) : (
                            <SelectValue placeholder={emptyValue} />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {priorityItems.map((item) => (
                            <SelectItem key={item.value} value={item.value} label={item.label}>
                              <span className="flex items-center gap-2">
                                <IssuePriorityIcon priority={item.value} size="sm" />
                                {item.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </PropertyRow>
                  ) : null}

                  {issue.templateKey ? (
                    <PropertyRow
                      icon={TagIcon}
                      label={<FormattedMessage {...messages.fieldTemplate} />}
                      interactive={false}
                    >
                      <ReadOnlyValue
                        value={issueSheetTemplateLabel(intl, issue.templateKey)}
                        empty={emptyValue}
                        className="truncate px-2"
                      />
                    </PropertyRow>
                  ) : null}

                  <PropertyRow
                    icon={TranslateIcon}
                    label={<FormattedMessage {...messages.fieldLocale} />}
                  >
                    <IssueLocalePicker
                      value={issue.targetLocale}
                      locales={projectQuery.data?.targetLocales ?? []}
                      allowClear
                      disabled={isSaving}
                      size="sm"
                      triggerClassName={issuePropertyControlClassName}
                      aria-label={intl.formatMessage(messages.fieldLocale)}
                      onValueChange={(targetLocale) => {
                        updateIssue.mutate({ targetLocale });
                      }}
                    />
                  </PropertyRow>

                  <PropertyRow
                    icon={FileIcon}
                    label={<FormattedMessage {...messages.fieldSourcePath} />}
                  >
                    <IssueSourcePathPicker
                      organizationSlug={organizationSlug}
                      projectId={projectId}
                      value={issue.sourcePath}
                      emptyValue={emptyValue}
                      disabled={isSaving}
                      triggerClassName={issuePropertyControlClassName}
                      onChange={(sourcePath) => {
                        if (sourcePath === issue.sourcePath) {
                          return;
                        }
                        updateIssue.mutate({
                          sourcePath,
                          segmentId: null,
                          translationKeyId: null,
                        });
                      }}
                    />
                  </PropertyRow>

                  {showCustomColumns
                    ? sidebarCustomColumns.map((column) => (
                        <PropertyRow
                          key={column.id}
                          icon={resolveIssueSheetColumnIcon(column.icon)}
                          label={column.label}
                        >
                          <IssueCustomColumnField
                            column={column}
                            value={issue.values[column.key]}
                            draft={customColumnDrafts[column.key] ?? ""}
                            emptyValue={emptyValue}
                            disabled={isSaving}
                            variant="sidebar"
                            members={assignableMembersQuery.data?.members ?? []}
                            membersLoading={assignableMembersQuery.isLoading}
                            imageUpload={{ organizationSlug, projectId }}
                            onDraftChange={(value) =>
                              draftStore.setCustomColumnDraft(column.key, value)
                            }
                            onCommit={() => saveCustomColumnDraft(column.key)}
                            onChange={(value) => saveCustomColumnValue(column.key, value)}
                          />
                        </PropertyRow>
                      ))
                    : null}
                </dl>
              </div>

              {!sidebarOpen ? (
                <div className="hidden flex-col items-center gap-2 lg:flex">
                  <CollapsibleTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label={sidebarToggleLabel}
                        title={sidebarToggleLabel}
                      />
                    }
                  >
                    <ArrowLeftIcon className="size-4 rtl:rotate-180" />
                  </CollapsibleTrigger>
                  {contentEditorHref ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={intl.formatMessage(messages.openInContentEditor)}
                      title={intl.formatMessage(messages.openInContentEditor)}
                      render={
                        <a href={contentEditorHref} target="_blank" rel="noopener noreferrer" />
                      }
                    >
                      <TranslateIcon className="size-4" />
                    </Button>
                  ) : null}
                  {showExternalLink && issue.linkUrl ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={issue.linkLabel || intl.formatMessage(messages.openLink)}
                      title={issue.linkLabel || intl.formatMessage(messages.openLink)}
                      render={
                        <a
                          href={issue.linkUrl}
                          {...(isExternalHttpUrl(issue.linkUrl)
                            ? { target: "_blank", rel: "noopener noreferrer" }
                            : {})}
                        />
                      }
                    >
                      <ArrowSquareOutIcon className="size-4" />
                    </Button>
                  ) : null}

                  <IssueAssigneePicker
                    value={issue.assigneeUserId}
                    currentLabel={issue.assignee}
                    members={assignableMembersQuery.data?.members ?? []}
                    isLoading={assignableMembersQuery.isLoading}
                    disabled={isSaving}
                    size="sm"
                    align="end"
                    onChange={(assigneeUserId) => {
                      updateIssue.mutate({ assigneeUserId });
                    }}
                  />

                  <Select
                    value={issue.status}
                    items={statusItems}
                    onValueChange={(value) => {
                      if (value) {
                        updateIssue.mutate({ status: value });
                      }
                    }}
                    disabled={isSaving}
                  >
                    <SelectTrigger
                      className={iconRailSelectTriggerClassName}
                      showIcon={false}
                      aria-label={intl.formatMessage(messages.fieldStatus)}
                      title={issueStatusLabel(intl, issue.status)}
                    >
                      <IssueStatusIcon status={issue.status} className="size-3.5" />
                    </SelectTrigger>
                    <SelectContent className="min-w-44 p-1.5" align="end">
                      {statusItems.map((status) => (
                        <SelectItem
                          key={status.value}
                          value={status.value}
                          label={status.label}
                          className="rounded-lg px-2 py-1.5 focus:bg-muted! focus:text-foreground! data-highlighted:bg-muted! data-highlighted:text-foreground!"
                        >
                          <span className="flex items-center gap-2">
                            <IssueStatusIcon status={status.value} className="size-3.5" />
                            {status.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={issue.issueType}
                    items={typeItems}
                    onValueChange={(value) => {
                      if (value && issueTypeValues.includes(value as IssueTypeValue)) {
                        updateIssue.mutate({ issueType: value });
                      }
                    }}
                    disabled={isSaving}
                  >
                    <SelectTrigger
                      className={iconRailSelectTriggerClassName}
                      showIcon={false}
                      aria-label={intl.formatMessage(messages.fieldType)}
                      title={issueTypeLabel(intl, issue.issueType)}
                    >
                      <TagIcon className="size-3.5" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {typeItems.map((type) => (
                        <SelectItem key={type.value} value={type.value} label={type.label}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {showPriorityField ? (
                    <Select
                      value={priority || null}
                      items={priorityItems}
                      onValueChange={(value) => {
                        if (value) {
                          setValue.mutate({ columnKey: "priority", value });
                        }
                      }}
                      disabled={isSaving}
                    >
                      <SelectTrigger
                        className={iconRailSelectTriggerClassName}
                        showIcon={false}
                        aria-label={intl.formatMessage(messages.fieldPriority)}
                        title={priority || emptyValue}
                      >
                        {priority ? (
                          <IssuePriorityIcon priority={priority} size="sm" />
                        ) : (
                          <FlagIcon className="size-3.5" />
                        )}
                      </SelectTrigger>
                      <SelectContent align="end">
                        {priorityItems.map((item) => (
                          <SelectItem key={item.value} value={item.value} label={item.label}>
                            <span className="flex items-center gap-2">
                              <IssuePriorityIcon priority={item.value} size="sm" />
                              {item.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </Collapsible>
        </div>
        <AlertDialog
          open={canDelete && isDeleteOpen}
          onOpenChange={(open) => {
            if (deleteIssue.isPending) {
              return;
            }
            draftStore.setDeleteOpen(open);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                <FormattedMessage {...messages.deleteConfirmTitle} />
              </AlertDialogTitle>
              <AlertDialogDescription>
                <FormattedMessage {...messages.deleteConfirmDescription} />
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteIssue.isPending}>
                <FormattedMessage {...messages.deleteCancel} />
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={deleteIssue.isPending}
                onClick={() => void confirmDelete()}
              >
                <FormattedMessage {...messages.deleteConfirmAction} />
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }),
);
