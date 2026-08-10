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
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  File01Icon,
  Flag01Icon,
  LanguageCircleIcon,
  LinkSquare02Icon,
  Tag01Icon,
  TranslateIcon,
  User02Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { cn } from "@/lib/primitives/cn";

import { IssueCustomColumnField } from "./issue-custom-column-field";
import { IssueMarkdownField } from "./issue-markdown-field";
import { issueMarkdownFieldMessages as markdownFieldMessages } from "./issue-markdown-field.messages";
import { IssueAssigneePicker } from "./issue-assignee-picker";
import { IssueCommentThread } from "./issue-comment-thread";
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
  type IssueDetailIssue,
} from "./issue-detail-utils";
import { IssueLocalePicker } from "./issue-locale-picker";
import { IssuePriorityIcon } from "./issue-priority-icon";
import { IssueStatusIcon } from "./issue-status-icon";
import {
  areCustomColumnDraftsDirty,
  buildCustomColumnDrafts,
  customColumnValueFromIssue,
  isDraftableCustomColumn,
  isMainContentCustomColumn,
  isSidebarCustomColumn,
  listDetailPanelColumns,
} from "./issue-sheet-column-utils";
import { IssueTypePicker, type IssueTypeValue } from "./issue-type-picker";
import { IssueWatchControl } from "./issue-watch-control";
import { useAssignableIssueMembersQuery } from "./use-assignable-issue-members";
import { useIssueDetailMutations } from "./use-issue-detail-mutations";
import { useIssueDetailQuery } from "./use-issue-detail-query";
import { useIssueSheetColumnsQuery } from "./use-issue-sheet-columns-query";
import { issueDetailPanelMessages as messages } from "./issue-detail-panel.messages";
import { type IssueDetailSidebarScope } from "./issue-detail-sidebar-state";
import { useIssueDetailSidebarOpen } from "./use-issue-detail-sidebar-open";
import { issueSheetSharedMessages as sharedMessages } from "../../projects/[projectId]/issue-sheet/_components/issue-sheet-shared.messages";
import { useProjectPageQuery } from "../../projects/[projectId]/_components/project-page-shell";
import { formatRelativeTimestamp } from "../workspace-files-shared";

type PropertyIcon = Parameters<typeof HugeiconsIcon>[0]["icon"];

export type IssueDetailPanelHandle = {
  isDirty: () => boolean;
  savePending: () => Promise<void>;
  beginCloseConfirm: () => void;
  endCloseConfirm: () => void;
  discardPending: () => void;
};

function ownerNoteFromIssue(issue: IssueDetailIssue) {
  return typeof issue.values.owner_note === "string" ? issue.values.owner_note : "";
}

function isIssueDraftDirty(
  issue: IssueDetailIssue,
  titleDraft: string,
  descriptionDraft: string,
  ownerNoteDraft: string,
  customColumnDrafts: Record<string, string>,
  detailColumns: ReturnType<typeof listDetailPanelColumns>,
) {
  return (
    titleDraft.trim() !== issue.title ||
    descriptionDraft !== issue.description ||
    ownerNoteDraft !== ownerNoteFromIssue(issue) ||
    areCustomColumnDraftsDirty(issue, detailColumns, customColumnDrafts)
  );
}

function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: PropertyIcon;
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 py-1.5">
      <dt className="flex min-w-0 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="flex min-h-8 min-w-0 max-w-[55%] items-center justify-end text-end">
        {children}
      </dd>
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
    <TypographyP className={cn("text-sm leading-5 text-foreground", className)}>
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

const ghostSelectTriggerClassName =
  "h-8 max-w-full justify-end border-transparent bg-transparent px-1.5 shadow-none hover:bg-muted/60 focus-visible:border-ring";

const iconRailSelectTriggerClassName =
  "size-8 justify-center border-transparent bg-transparent p-0 shadow-none hover:bg-muted/60 focus-visible:border-ring";

export const IssueDetailPanel = forwardRef<
  IssueDetailPanelHandle,
  {
    organizationSlug: string;
    projectId: string;
    issueId: string;
    onDirtyChange?: (dirty: boolean) => void;
    defaultSidebarOpen?: boolean;
    sidebarStorageScope?: IssueDetailSidebarScope;
  }
>(function IssueDetailPanel(
  {
    organizationSlug,
    projectId,
    issueId,
    onDirtyChange,
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
  const actorUserId = assignableMembersQuery.data?.members.find(
    (member) => member.isCurrentUser,
  )?.userId;

  const { updateIssue, setValue, cancelPending } = useIssueDetailMutations({
    organizationSlug,
    projectId,
    issueId,
    actorUserId,
    onSaved: () => toast.success(intl.formatMessage(messages.saved)),
  });

  const issue = issueQuery.data;
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [ownerNoteDraft, setOwnerNoteDraft] = useState("");
  const [customColumnDrafts, setCustomColumnDrafts] = useState<Record<string, string>>({});
  const [sidebarOpen, setSidebarOpen] = useIssueDetailSidebarOpen(
    sidebarStorageScope,
    issueId,
    defaultSidebarOpen,
  );
  const isSaving = updateIssue.isPending || setValue.isPending;

  const titleDraftRef = useRef(titleDraft);
  const descriptionDraftRef = useRef(descriptionDraft);
  const ownerNoteDraftRef = useRef(ownerNoteDraft);
  const customColumnDraftsRef = useRef(customColumnDrafts);
  const issueRef = useRef(issue);
  const detailColumnsRef = useRef<ReturnType<typeof listDetailPanelColumns>>([]);
  const suppressAutoSaveRef = useRef(false);
  const draftBaselineRef = useRef<{
    issueId: string;
    title: string;
    description: string;
    ownerNote: string;
  } | null>(null);
  const customColumnBaselineRef = useRef<{
    issueId: string;
    drafts: Record<string, string>;
  } | null>(null);
  titleDraftRef.current = titleDraft;
  descriptionDraftRef.current = descriptionDraft;
  ownerNoteDraftRef.current = ownerNoteDraft;
  customColumnDraftsRef.current = customColumnDrafts;
  issueRef.current = issue;

  const detailColumns = useMemo(
    () => listDetailPanelColumns(columnsQuery.data ?? []),
    [columnsQuery.data],
  );
  detailColumnsRef.current = detailColumns;

  useEffect(() => {
    if (!issue) {
      return;
    }

    const ownerNote = ownerNoteFromIssue(issue);
    const baseline = draftBaselineRef.current;

    if (!baseline || baseline.issueId !== issue.id) {
      draftBaselineRef.current = {
        issueId: issue.id,
        title: issue.title,
        description: issue.description,
        ownerNote,
      };
      setTitleDraft(issue.title);
      setDescriptionDraft(issue.description);
      setOwnerNoteDraft(ownerNote);
      return;
    }

    setTitleDraft((draft) => (draft === baseline.title ? issue.title : draft));
    setDescriptionDraft((draft) => (draft === baseline.description ? issue.description : draft));
    setOwnerNoteDraft((draft) => (draft === baseline.ownerNote ? ownerNote : draft));
    draftBaselineRef.current = {
      issueId: issue.id,
      title: issue.title,
      description: issue.description,
      ownerNote,
    };
  }, [issue]);

  useEffect(() => {
    if (!issue) {
      setCustomColumnDrafts({});
      customColumnBaselineRef.current = null;
      return;
    }

    const draftableColumns = detailColumns.filter(isDraftableCustomColumn);
    const baseline = customColumnBaselineRef.current;

    if (!baseline || baseline.issueId !== issue.id) {
      const drafts = buildCustomColumnDrafts(issue, draftableColumns);
      customColumnBaselineRef.current = { issueId: issue.id, drafts };
      setCustomColumnDrafts(drafts);
      return;
    }

    setCustomColumnDrafts((current) => {
      const next = { ...current };
      let changed = false;
      for (const column of draftableColumns) {
        const saved = customColumnValueFromIssue(issue, column.key);
        const baselineDraft = baseline.drafts[column.key];
        if (!(column.key in next)) {
          next[column.key] = saved;
          changed = true;
          continue;
        }
        if (next[column.key] === baselineDraft) {
          next[column.key] = saved;
          changed = true;
        }
      }
      if (changed) {
        customColumnBaselineRef.current = {
          issueId: issue.id,
          drafts: buildCustomColumnDrafts(issue, draftableColumns),
        };
      }
      return changed ? next : current;
    });
  }, [issue, detailColumns]);

  useEffect(() => {
    if (!onDirtyChange) {
      return;
    }
    if (!issue) {
      onDirtyChange(false);
      return;
    }
    onDirtyChange(
      isIssueDraftDirty(
        issue,
        titleDraft,
        descriptionDraft,
        ownerNoteDraft,
        customColumnDrafts,
        detailColumns,
      ),
    );
  }, [
    issue,
    titleDraft,
    descriptionDraft,
    ownerNoteDraft,
    customColumnDrafts,
    detailColumns,
    onDirtyChange,
  ]);

  useImperativeHandle(ref, () => ({
    isDirty: () => {
      const current = issueRef.current;
      if (!current) {
        return false;
      }
      return isIssueDraftDirty(
        current,
        titleDraftRef.current,
        descriptionDraftRef.current,
        ownerNoteDraftRef.current,
        customColumnDraftsRef.current,
        detailColumnsRef.current,
      );
    },
    beginCloseConfirm: () => {
      suppressAutoSaveRef.current = true;
    },
    endCloseConfirm: () => {
      suppressAutoSaveRef.current = false;
    },
    discardPending: () => {
      suppressAutoSaveRef.current = true;
      cancelPending();
      const current = issueRef.current;
      if (current) {
        const drafts = buildCustomColumnDrafts(current, detailColumnsRef.current);
        customColumnBaselineRef.current = { issueId: current.id, drafts };
        setCustomColumnDrafts(drafts);
      }
    },
    savePending: async () => {
      const current = issueRef.current;
      if (!current) {
        return;
      }

      const nextTitle = titleDraftRef.current.trim();
      if (nextTitle === "") {
        toast.error(intl.formatMessage(messages.titleRequired));
        throw new Error("title_required");
      }

      const issueUpdates: Record<string, unknown> = {};
      if (nextTitle !== current.title) {
        issueUpdates.title = nextTitle;
      }
      if (descriptionDraftRef.current !== current.description) {
        issueUpdates.description = descriptionDraftRef.current;
      }
      if (Object.keys(issueUpdates).length > 0) {
        await updateIssue.mutateAsync(issueUpdates);
      }

      const nextOwnerNote = ownerNoteDraftRef.current;
      if (nextOwnerNote !== ownerNoteFromIssue(current)) {
        await setValue.mutateAsync({
          columnKey: "owner_note",
          value: nextOwnerNote,
        });
      }

      for (const column of detailColumnsRef.current.filter(isDraftableCustomColumn)) {
        const draft = customColumnDraftsRef.current[column.key];
        if (draft === undefined) {
          continue;
        }
        if (draft === customColumnValueFromIssue(current, column.key)) {
          continue;
        }
        await setValue.mutateAsync({
          columnKey: column.key,
          value: draft,
        });
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
    if (suppressAutoSaveRef.current) {
      return;
    }
    setValue.mutate({ columnKey, value });
  };

  const saveCustomColumnDraft = (columnKey: string) => {
    if (suppressAutoSaveRef.current) {
      return;
    }
    const current = issueRef.current;
    if (!current) {
      return;
    }
    const draft = customColumnDraftsRef.current[columnKey];
    if (draft === undefined) {
      return;
    }
    if (draft === customColumnValueFromIssue(current, columnKey)) {
      return;
    }
    setValue.mutate({ columnKey, value: draft });
  };

  const updateCustomColumnDraft = (columnKey: string, value: string) => {
    setCustomColumnDrafts((current) => ({
      ...current,
      [columnKey]: value,
    }));
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
        <TypographyP className="text-sm text-destructive">
          <FormattedMessage {...messages.loadError} />
        </TypographyP>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="px-6 py-5">
        <TypographyP className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.notFound} />
        </TypographyP>
      </div>
    );
  }

  const catHref = buildIssueCatHref(organizationSlug, projectId, issue);
  const priority = typeof issue.values.priority === "string" ? issue.values.priority : "";
  const hasLinkedContext = Boolean(
    issue.translationKeyId || issue.key || issue.sourceText || issue.segmentId || issue.linkKind,
  );

  const saveTitle = () => {
    if (suppressAutoSaveRef.current) {
      return;
    }
    const next = titleDraft.trim();
    if (!next || next === issue.title) {
      return;
    }
    updateIssue.mutate({ title: next });
  };

  const saveDescription = () => {
    if (suppressAutoSaveRef.current) {
      return;
    }
    if (descriptionDraft === issue.description) {
      return;
    }
    updateIssue.mutate({ description: descriptionDraft });
  };

  const saveOwnerNote = () => {
    if (suppressAutoSaveRef.current) {
      return;
    }
    const current = ownerNoteFromIssue(issue);
    if (ownerNoteDraft === current) {
      return;
    }
    setValue.mutate({ columnKey: "owner_note", value: ownerNoteDraft });
  };

  return (
    <div
      className={cn(
        "grid h-full min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden lg:grid-rows-none",
        sidebarOpen ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : "lg:grid-cols-[minmax(0,1fr)_3rem]",
      )}
      aria-busy={isSaving}
    >
      <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto px-6 py-5">
        <Textarea
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.currentTarget.value)}
          onBlur={saveTitle}
          disabled={isSaving}
          aria-label={intl.formatMessage(messages.fieldTitle)}
          rows={1}
          className={cn(
            "min-h-10 shrink-0 overflow-hidden rounded-none border-transparent bg-transparent px-0 py-1 text-lg font-semibold shadow-none md:min-h-10 md:text-xl",
            "focus-visible:border-transparent focus-visible:ring-0",
          )}
        />

        <IssueMarkdownField
          key={`${issue.id}-description`}
          value={descriptionDraft}
          onChange={setDescriptionDraft}
          onCommit={saveDescription}
          disabled={isSaving}
          placeholder={intl.formatMessage(messages.fieldDescription)}
          emptyMessage={intl.formatMessage(markdownFieldMessages.emptyDescription)}
          ariaLabel={intl.formatMessage(messages.fieldDescription)}
        />

        <section className="mt-2 grid gap-2 border-t border-border pt-4">
          <TypographyP className="text-sm font-medium text-foreground">
            <FormattedMessage {...messages.fieldOwnerNote} />
          </TypographyP>
          <IssueMarkdownField
            key={`${issue.id}-owner-note`}
            value={ownerNoteDraft}
            onChange={setOwnerNoteDraft}
            onCommit={saveOwnerNote}
            disabled={isSaving}
            placeholder={intl.formatMessage(messages.fieldOwnerNotePlaceholder)}
            emptyMessage={intl.formatMessage(markdownFieldMessages.emptyOwnerNote)}
            ariaLabel={intl.formatMessage(messages.fieldOwnerNote)}
          />
        </section>

        {showCustomColumns
          ? mainCustomColumns.map((column) => (
              <section key={column.id} className="mt-2 grid gap-2 border-t border-border pt-4">
                <TypographyP className="text-sm font-medium text-foreground">
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
                  onDraftChange={(value) => updateCustomColumnDraft(column.key, value)}
                  onCommit={() => saveCustomColumnDraft(column.key)}
                  onChange={(value) => saveCustomColumnValue(column.key, value)}
                />
              </section>
            ))
          : null}

        {hasLinkedContext ? (
          <section className="mt-2 grid gap-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <TypographyP className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                <HugeiconsIcon
                  icon={LinkSquare02Icon}
                  strokeWidth={1.8}
                  className="size-3.5 text-muted-foreground"
                />
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
                  <ReadOnlyValue value={linkKindLabel(intl, issue.linkKind)} empty={emptyValue} />
                </LinkedContextRow>
              ) : null}
            </div>
          </section>
        ) : null}

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
          <div className="mb-2 hidden shrink-0 lg:flex lg:justify-end">
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={cn(!sidebarOpen && "mx-auto")}
                  aria-label={intl.formatMessage(
                    sidebarOpen ? messages.collapseSidebar : messages.expandSidebar,
                  )}
                />
              }
            >
              <HugeiconsIcon
                icon={sidebarOpen ? ArrowRight01Icon : ArrowLeft01Icon}
                strokeWidth={1.8}
                className="size-4 rtl:rotate-180"
              />
            </CollapsibleTrigger>
          </div>

          <div className={cn("flex flex-col gap-1", !sidebarOpen && "lg:hidden")}>
            <div className="mb-3 flex flex-col gap-2">
              {catHref ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  render={<a href={catHref} />}
                >
                  <HugeiconsIcon icon={TranslateIcon} strokeWidth={1.8} data-icon="inline-start" />
                  <FormattedMessage {...messages.openInCat} />
                </Button>
              ) : (
                <TypographyP className="text-xs text-muted-foreground">
                  <FormattedMessage {...messages.openInCatUnavailable} />
                </TypographyP>
              )}
              {issue.linkUrl && issue.linkUrl !== catHref && isHttpOrHttpsUrl(issue.linkUrl) ? (
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
                  <HugeiconsIcon
                    icon={LinkSquare02Icon}
                    strokeWidth={1.8}
                    data-icon="inline-start"
                  />
                  {issue.linkLabel || intl.formatMessage(messages.openLink)}
                </Button>
              ) : null}
            </div>

            {columnsQuery.isError ? (
              <div className="mb-3 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <TypographyP className="text-xs text-destructive">
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
                icon={User02Icon}
                label={<FormattedMessage {...messages.fieldAssignee} />}
              >
                <IssueAssigneePicker
                  value={issue.assigneeUserId}
                  currentLabel={issue.assignee}
                  members={assignableMembersQuery.data?.members ?? []}
                  isLoading={assignableMembersQuery.isLoading}
                  disabled={isSaving}
                  size="ghost"
                  triggerClassName={ghostSelectTriggerClassName}
                  onChange={(assigneeUserId) => {
                    updateIssue.mutate({ assigneeUserId });
                  }}
                />
              </PropertyRow>

              <PropertyRow
                icon={CheckmarkCircle02Icon}
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
                  <SelectTrigger className={ghostSelectTriggerClassName} showIcon={false}>
                    <span className="flex items-center gap-2">
                      <IssueStatusIcon status={issue.status} className="size-3.5" />
                      {issueStatusLabel(intl, issue.status)}
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

              <PropertyRow icon={Tag01Icon} label={<FormattedMessage {...messages.fieldType} />}>
                <IssueTypePicker
                  value={issue.issueType as IssueTypeValue}
                  onValueChange={(value) => {
                    updateIssue.mutate({ issueType: value });
                  }}
                  disabled={isSaving}
                  showIcon={false}
                  triggerClassName={ghostSelectTriggerClassName}
                />
              </PropertyRow>

              <PropertyRow
                icon={Flag01Icon}
                label={<FormattedMessage {...messages.fieldPriority} />}
              >
                <Select
                  value={priority || undefined}
                  items={priorityItems}
                  onValueChange={(value) => {
                    if (value) {
                      setValue.mutate({ columnKey: "priority", value });
                    }
                  }}
                  disabled={isSaving}
                >
                  <SelectTrigger className={ghostSelectTriggerClassName} showIcon={false}>
                    {priority ? (
                      <IssuePriorityIcon priority={priority} size="sm" />
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

              <PropertyRow
                icon={UserCircleIcon}
                label={<FormattedMessage {...messages.fieldReporter} />}
              >
                <ReadOnlyValue value={issue.reporter} empty={emptyValue} className="truncate" />
              </PropertyRow>

              <PropertyRow
                icon={LanguageCircleIcon}
                label={<FormattedMessage {...messages.fieldLocale} />}
              >
                <IssueLocalePicker
                  value={issue.targetLocale}
                  locales={projectQuery.data?.targetLocales ?? []}
                  allowClear
                  disabled={isSaving}
                  showIcon={false}
                  size="sm"
                  triggerClassName={ghostSelectTriggerClassName}
                  aria-label={intl.formatMessage(messages.fieldLocale)}
                  onValueChange={(targetLocale) => {
                    updateIssue.mutate({ targetLocale });
                  }}
                />
              </PropertyRow>

              <PropertyRow
                icon={File01Icon}
                label={<FormattedMessage {...messages.fieldSourcePath} />}
              >
                <ReadOnlyValue value={issue.sourcePath} empty={emptyValue} className="truncate" />
              </PropertyRow>

              <PropertyRow
                icon={Calendar03Icon}
                label={<FormattedMessage {...messages.fieldCreatedAt} />}
              >
                <ReadOnlyValue
                  value={formatRelativeTimestamp(issue.createdAt)}
                  empty={emptyValue}
                  className="truncate"
                />
              </PropertyRow>

              <PropertyRow
                icon={Clock01Icon}
                label={<FormattedMessage {...messages.fieldUpdatedAt} />}
              >
                <ReadOnlyValue
                  value={formatRelativeTimestamp(issue.updatedAt)}
                  empty={emptyValue}
                  className="truncate"
                />
              </PropertyRow>

              {issue.resolvedAt ? (
                <PropertyRow
                  icon={CheckmarkCircle02Icon}
                  label={<FormattedMessage {...messages.fieldResolvedAt} />}
                >
                  <ReadOnlyValue
                    value={formatRelativeTimestamp(issue.resolvedAt)}
                    empty={emptyValue}
                    className="truncate"
                  />
                </PropertyRow>
              ) : null}

              {showCustomColumns
                ? sidebarCustomColumns.map((column) => (
                    <PropertyRow key={column.id} icon={Tag01Icon} label={column.label}>
                      <IssueCustomColumnField
                        column={column}
                        value={issue.values[column.key]}
                        draft={customColumnDrafts[column.key] ?? ""}
                        emptyValue={emptyValue}
                        disabled={isSaving}
                        variant="sidebar"
                        members={assignableMembersQuery.data?.members ?? []}
                        membersLoading={assignableMembersQuery.isLoading}
                        onDraftChange={(value) => updateCustomColumnDraft(column.key, value)}
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
              {catHref ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={intl.formatMessage(messages.openInCat)}
                  title={intl.formatMessage(messages.openInCat)}
                  render={<a href={catHref} />}
                >
                  <HugeiconsIcon icon={TranslateIcon} strokeWidth={1.8} className="size-4" />
                </Button>
              ) : null}
              {issue.linkUrl && issue.linkUrl !== catHref && isHttpOrHttpsUrl(issue.linkUrl) ? (
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
                  <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.8} className="size-4" />
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
                  <HugeiconsIcon icon={Tag01Icon} strokeWidth={1.8} className="size-3.5" />
                </SelectTrigger>
                <SelectContent align="end">
                  {typeItems.map((type) => (
                    <SelectItem key={type.value} value={type.value} label={type.label}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={priority || undefined}
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
                    <HugeiconsIcon icon={Flag01Icon} strokeWidth={1.8} className="size-3.5" />
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
            </div>
          ) : null}
        </aside>
      </Collapsible>
    </div>
  );
});
