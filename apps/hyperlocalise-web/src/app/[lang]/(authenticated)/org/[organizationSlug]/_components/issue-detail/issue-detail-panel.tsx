"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  issuePriorityValues,
  issueStatusLabel,
  issueStatusValues,
  issueStatusVariant,
  issueTypeLabel,
  issueTypeValues,
} from "./issue-detail-utils";
import { useIssueDetailMutations } from "./use-issue-detail-mutations";
import { useIssueDetailQuery } from "./use-issue-detail-query";

type WorkspaceMember = {
  userId: string;
  displayName: string;
  status: "active" | "invited";
};

type PropertyIcon = Parameters<typeof HugeiconsIcon>[0]["icon"];

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
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="flex min-w-0 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="flex min-w-0 max-w-[55%] justify-end text-end">{children}</dd>
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
    <div className="grid flex-1 md:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex flex-col gap-4 px-6 py-5">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <aside className="flex flex-col gap-3 border-t border-border bg-muted/20 px-4 py-5 md:border-t-0 md:border-s">
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

export function IssueDetailPanel({
  organizationSlug,
  projectId,
  issueId,
}: {
  organizationSlug: string;
  projectId: string;
  issueId: string;
}) {
  const intl = useIntl();
  const emptyValue = intl.formatMessage(sharedMessages.emptyValue);
  const issueQuery = useIssueDetailQuery({ organizationSlug, projectId, issueId });
  const { updateIssue, setValue } = useIssueDetailMutations({
    organizationSlug,
    projectId,
    issueId,
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
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!issue) {
      return;
    }
    setTitleDraft(issue.title);
    setDescriptionDraft(issue.description);
  }, [issue]);

  useEffect(() => {
    if (!updateIssue.isSuccess && !setValue.isSuccess) {
      return;
    }
    setShowSaved(true);
    const timeout = window.setTimeout(() => setShowSaved(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [setValue.isSuccess, updateIssue.isSuccess]);

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

  const isSaving = updateIssue.isPending || setValue.isPending;

  if (issueQuery.isLoading) {
    return (
      <div aria-busy="true" aria-live="polite" className="flex flex-1 flex-col">
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
    const next = titleDraft.trim();
    if (!next || next === issue.title) {
      return;
    }
    updateIssue.mutate({ title: next });
  };

  const saveDescription = () => {
    if (descriptionDraft === issue.description) {
      return;
    }
    updateIssue.mutate({ description: descriptionDraft });
  };

  return (
    <div className="grid flex-1 md:grid-cols-[minmax(0,1fr)_18rem]" aria-busy={isSaving}>
      <div className="flex min-w-0 flex-col gap-3 px-6 py-5">
        {showSaved ? (
          <TypographyP className="text-xs text-muted-foreground" aria-live="polite">
            <FormattedMessage {...messages.saved} />
          </TypographyP>
        ) : null}

        <Input
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.currentTarget.value)}
          onBlur={saveTitle}
          disabled={isSaving}
          aria-label={intl.formatMessage(messages.fieldTitle)}
          className={cn(
            "h-auto rounded-none border-transparent bg-transparent px-0 py-1 text-lg font-semibold shadow-none md:text-xl",
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
            "min-h-32 rounded-none border-transparent bg-transparent px-0 py-1 text-sm shadow-none md:text-sm",
            "focus-visible:border-transparent focus-visible:ring-0",
          )}
        />

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
                  <ReadOnlyValue value={issue.linkKind} empty={emptyValue} />
                </LinkedContextRow>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      <aside className="flex flex-col gap-1 border-t border-border bg-muted/20 px-4 py-5 md:border-t-0 md:border-s">
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
          {issue.linkUrl && issue.linkUrl !== catHref ? (
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
                    {status.label}
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
                <SelectValue placeholder={emptyValue} />
              </SelectTrigger>
              <SelectContent>
                {priorityItems.map((item) => (
                  <SelectItem key={item.value} value={item.value} label={item.label}>
                    {item.label}
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
}
