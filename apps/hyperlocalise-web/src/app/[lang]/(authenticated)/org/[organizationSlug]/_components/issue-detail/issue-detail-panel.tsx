"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
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
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";

import { formatRelativeTimestamp } from "../workspace-files-shared";
import { issueSheetSharedMessages as sharedMessages } from "../../projects/[projectId]/issue-sheet/_components/issue-sheet-shared.messages";
import { issueDetailPanelMessages as messages } from "./issue-detail-panel.messages";
import {
  buildIssueCatHref,
  isExternalHttpUrl,
  isHttpOrHttpsUrl,
  issuePriorityValues,
  issuePriorityVariant,
  issueStatusLabel,
  issueStatusValues,
  issueStatusVariant,
  issueTypeLabel,
  issueTypeValues,
  linkKindLabel,
  type IssueDetailIssue,
} from "./issue-detail-utils";
import { useIssueDetailMutations } from "./use-issue-detail-mutations";
import { useIssueDetailQuery } from "./use-issue-detail-query";

type WorkspaceMember = {
  userId: string;
  displayName: string;
  status: "active" | "invited";
};

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
) {
  return (
    titleDraft.trim() !== issue.title ||
    descriptionDraft !== issue.description ||
    ownerNoteDraft !== ownerNoteFromIssue(issue)
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
    <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_22rem] md:overflow-hidden">
      <div className="flex flex-col gap-4 px-6 py-5 md:min-h-0 md:overflow-y-auto">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <aside className="flex flex-col gap-3 border-t border-border bg-muted/20 px-4 py-5 md:min-h-0 md:overflow-y-auto md:border-t-0 md:border-s">
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

export const IssueDetailPanel = forwardRef<
  IssueDetailPanelHandle,
  {
    organizationSlug: string;
    projectId: string;
    issueId: string;
  }
>(function IssueDetailPanel({ organizationSlug, projectId, issueId }, ref) {
  const intl = useIntl();
  const emptyValue = intl.formatMessage(sharedMessages.emptyValue);
  const issueQuery = useIssueDetailQuery({ organizationSlug, projectId, issueId });
  const { updateIssue, setValue, cancelPending } = useIssueDetailMutations({
    organizationSlug,
    projectId,
    issueId,
    onSaved: () => toast.success(intl.formatMessage(messages.saved)),
  });

  const membersQuery = useQuery({
    queryKey: ["workspace-members", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].members.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load members");
      }
      const body = (await response.json()) as {
        members: WorkspaceMember[];
      };
      return body.members.filter((member) => member.status === "active");
    },
  });

  const issue = issueQuery.data;
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [ownerNoteDraft, setOwnerNoteDraft] = useState("");
  const isSaving = updateIssue.isPending || setValue.isPending;

  const titleDraftRef = useRef(titleDraft);
  const descriptionDraftRef = useRef(descriptionDraft);
  const ownerNoteDraftRef = useRef(ownerNoteDraft);
  const issueRef = useRef(issue);
  const suppressAutoSaveRef = useRef(false);
  const draftBaselineRef = useRef<{
    issueId: string;
    title: string;
    description: string;
    ownerNote: string;
  } | null>(null);
  titleDraftRef.current = titleDraft;
  descriptionDraftRef.current = descriptionDraft;
  ownerNoteDraftRef.current = ownerNoteDraft;
  issueRef.current = issue;

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
        await setValue.mutateAsync({ columnKey: "owner_note", value: nextOwnerNote });
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

  const issueTypeItems = useMemo(
    () =>
      issueTypeValues.map((value) => ({
        value,
        label: issueTypeLabel(intl, value),
      })),
    [intl],
  );

  const priorityItems = useMemo(
    () => issuePriorityValues.map((value) => ({ value, label: value })),
    [],
  );

  const assigneeItems = useMemo(() => {
    const members = membersQuery.data ?? [];
    return [
      { value: "unassigned", label: intl.formatMessage(messages.assigneeUnassigned) },
      ...members.map((member) => ({ value: member.userId, label: member.displayName })),
    ];
  }, [intl, membersQuery.data]);

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
    issue.key || issue.sourceText || issue.segmentId || issue.linkKind,
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
      className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_22rem] md:overflow-hidden"
      aria-busy={isSaving}
    >
      <div className="flex min-w-0 flex-col gap-3 px-6 py-5 md:min-h-0 md:overflow-y-auto">
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

        <Textarea
          value={descriptionDraft}
          onChange={(event) => setDescriptionDraft(event.currentTarget.value)}
          onBlur={saveDescription}
          disabled={isSaving}
          aria-label={intl.formatMessage(messages.fieldDescription)}
          placeholder={intl.formatMessage(messages.fieldDescription)}
          className={cn(
            "min-h-32 shrink-0 overflow-hidden rounded-none border-transparent bg-transparent px-0 py-1 text-sm shadow-none md:text-sm",
            "focus-visible:border-transparent focus-visible:ring-0",
          )}
        />

        <section className="mt-2 grid gap-2 border-t border-border pt-4">
          <TypographyP className="text-sm font-medium text-foreground">
            <FormattedMessage {...messages.fieldOwnerNote} />
          </TypographyP>
          <Textarea
            value={ownerNoteDraft}
            onChange={(event) => setOwnerNoteDraft(event.currentTarget.value)}
            onBlur={saveOwnerNote}
            disabled={isSaving}
            aria-label={intl.formatMessage(messages.fieldOwnerNote)}
            placeholder={intl.formatMessage(messages.fieldOwnerNotePlaceholder)}
            className={cn(
              "min-h-20 shrink-0 overflow-hidden rounded-none border-transparent bg-transparent px-0 py-1 text-sm shadow-none md:text-sm",
              "focus-visible:border-transparent focus-visible:ring-0",
            )}
          />
        </section>

        {hasLinkedContext ? (
          <section className="mt-2 grid gap-3 border-t border-border pt-4">
            <TypographyP className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
              <HugeiconsIcon
                icon={LinkSquare02Icon}
                strokeWidth={1.8}
                className="size-3.5 text-muted-foreground"
              />
              <FormattedMessage {...messages.linkedContext} />
            </TypographyP>
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
      </div>

      <aside className="flex flex-col gap-1 border-t border-border bg-muted/20 px-4 py-5 md:min-h-0 md:overflow-y-auto md:border-t-0 md:border-s">
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
              <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.8} data-icon="inline-start" />
              {issue.linkLabel || intl.formatMessage(messages.openLink)}
            </Button>
          ) : null}
        </div>

        <dl className="flex flex-col">
          <PropertyRow icon={User02Icon} label={<FormattedMessage {...messages.fieldAssignee} />}>
            <Select
              value={issue.assigneeUserId ?? "unassigned"}
              items={assigneeItems}
              onValueChange={(value) => {
                if (!value) {
                  return;
                }
                updateIssue.mutate({
                  assigneeUserId: value === "unassigned" ? null : value,
                });
              }}
              disabled={isSaving || membersQuery.isLoading}
            >
              <SelectTrigger className={ghostSelectTriggerClassName}>
                <SelectValue placeholder={emptyValue} />
              </SelectTrigger>
              <SelectContent>
                {assigneeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value} label={item.label}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              <SelectTrigger className={ghostSelectTriggerClassName}>
                <Badge variant={issueStatusVariant(issue.status)}>
                  {issueStatusLabel(intl, issue.status)}
                </Badge>
              </SelectTrigger>
              <SelectContent>
                {statusItems.map((status) => (
                  <SelectItem key={status.value} value={status.value} label={status.label}>
                    <Badge variant={issueStatusVariant(status.value)}>{status.label}</Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PropertyRow>

          <PropertyRow icon={Tag01Icon} label={<FormattedMessage {...messages.fieldType} />}>
            <Select
              value={issue.issueType}
              items={issueTypeItems}
              onValueChange={(value) => {
                if (value) {
                  updateIssue.mutate({ issueType: value });
                }
              }}
              disabled={isSaving}
            >
              <SelectTrigger className={ghostSelectTriggerClassName}>
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
          </PropertyRow>

          <PropertyRow icon={Flag01Icon} label={<FormattedMessage {...messages.fieldPriority} />}>
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
              <SelectTrigger className={ghostSelectTriggerClassName}>
                {priority ? (
                  <Badge variant={issuePriorityVariant(priority)}>{priority}</Badge>
                ) : (
                  <SelectValue placeholder={emptyValue} />
                )}
              </SelectTrigger>
              <SelectContent>
                {priorityItems.map((item) => (
                  <SelectItem key={item.value} value={item.value} label={item.label}>
                    <Badge variant={issuePriorityVariant(item.value)}>{item.label}</Badge>
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
            <ReadOnlyValue value={issue.targetLocale} empty={emptyValue} className="truncate" />
          </PropertyRow>

          <PropertyRow icon={File01Icon} label={<FormattedMessage {...messages.fieldSourcePath} />}>
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

          <PropertyRow icon={Clock01Icon} label={<FormattedMessage {...messages.fieldUpdatedAt} />}>
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
        </dl>
      </aside>
    </div>
  );
});
