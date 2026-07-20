"use client";

import { useEffect, useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
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

function DetailField({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Field className={cn("gap-1.5", className)}>
      <FieldLabel className="text-xs text-muted-foreground">{label}</FieldLabel>
      {children}
    </Field>
  );
}

function ReadOnlyValue({ value, empty }: { value: string | null; empty: string }) {
  return (
    <TypographyP className="text-sm text-foreground">{value?.trim() ? value : empty}</TypographyP>
  );
}

function IssueDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-6 pb-6">
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

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
      <div aria-busy="true" aria-live="polite">
        <TypographyP className="sr-only">
          <FormattedMessage {...messages.loading} />
        </TypographyP>
        <IssueDetailSkeleton />
      </div>
    );
  }

  if (issueQuery.isError) {
    return (
      <div className="px-6 pb-6">
        <TypographyP className="text-sm text-destructive">
          <FormattedMessage {...messages.loadError} />
        </TypographyP>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="px-6 pb-6">
        <TypographyP className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.notFound} />
        </TypographyP>
      </div>
    );
  }

  const catHref = buildIssueCatHref(organizationSlug, projectId, issue);
  const priority = typeof issue.values.priority === "string" ? issue.values.priority : "";

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
    <div className="flex flex-col gap-6 px-6 pb-6" aria-busy={isSaving}>
      {showSaved ? (
        <TypographyP className="text-xs text-muted-foreground" aria-live="polite">
          <FormattedMessage {...messages.saved} />
        </TypographyP>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {catHref ? (
          <Button variant="default" size="sm" render={<a href={catHref} />}>
            <FormattedMessage {...messages.openInCat} />
          </Button>
        ) : (
          <TypographyP className="text-xs text-muted-foreground">
            <FormattedMessage {...messages.openInCatUnavailable} />
          </TypographyP>
        )}
        {issue.linkUrl && issue.linkUrl !== catHref ? (
          <Button
            variant="outline"
            size="sm"
            render={
              <a
                href={issue.linkUrl}
                {...(isExternalHttpUrl(issue.linkUrl)
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              />
            }
          >
            {issue.linkLabel || intl.formatMessage(messages.openLink)}
          </Button>
        ) : null}
      </div>

      <DetailField label={<FormattedMessage {...messages.fieldTitle} />}>
        <Input
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.currentTarget.value)}
          onBlur={saveTitle}
          disabled={isSaving}
        />
      </DetailField>

      <DetailField label={<FormattedMessage {...messages.fieldDescription} />}>
        <Textarea
          value={descriptionDraft}
          onChange={(event) => setDescriptionDraft(event.currentTarget.value)}
          onBlur={saveDescription}
          disabled={isSaving}
          className="min-h-28"
        />
      </DetailField>

      <div className="grid gap-4 sm:grid-cols-2">
        <DetailField label={<FormattedMessage {...messages.fieldStatus} />}>
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
            <SelectTrigger className="w-full">
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
        </DetailField>

        <DetailField label={<FormattedMessage {...messages.fieldType} />}>
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
            <SelectTrigger className="w-full">
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
        </DetailField>

        <DetailField label={<FormattedMessage {...messages.fieldPriority} />}>
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
            <SelectTrigger className="w-full">
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
        </DetailField>

        <DetailField label={<FormattedMessage {...messages.fieldAssignee} />}>
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
            <SelectTrigger className="w-full">
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
        </DetailField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DetailField label={<FormattedMessage {...messages.fieldReporter} />}>
          <ReadOnlyValue value={issue.reporter} empty={emptyValue} />
        </DetailField>
        <DetailField label={<FormattedMessage {...messages.fieldLocale} />}>
          <ReadOnlyValue value={issue.targetLocale} empty={emptyValue} />
        </DetailField>
        <DetailField
          label={<FormattedMessage {...messages.fieldSourcePath} />}
          className="sm:col-span-2"
        >
          <ReadOnlyValue value={issue.sourcePath} empty={emptyValue} />
        </DetailField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DetailField label={<FormattedMessage {...messages.fieldCreatedAt} />}>
          <ReadOnlyValue value={formatRelativeTimestamp(issue.createdAt)} empty={emptyValue} />
        </DetailField>
        <DetailField label={<FormattedMessage {...messages.fieldUpdatedAt} />}>
          <ReadOnlyValue value={formatRelativeTimestamp(issue.updatedAt)} empty={emptyValue} />
        </DetailField>
        {issue.resolvedAt ? (
          <DetailField label={<FormattedMessage {...messages.fieldResolvedAt} />}>
            <ReadOnlyValue value={formatRelativeTimestamp(issue.resolvedAt)} empty={emptyValue} />
          </DetailField>
        ) : null}
      </div>

      {(issue.key || issue.sourceText || issue.segmentId || issue.linkKind) && (
        <div className="rounded-xl border bg-muted/30 p-4">
          <TypographyP className="text-sm font-medium text-foreground">
            <FormattedMessage {...messages.linkedContext} />
          </TypographyP>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {issue.key ? (
              <DetailField label={<FormattedMessage {...messages.fieldKey} />}>
                <ReadOnlyValue value={issue.key} empty={emptyValue} />
              </DetailField>
            ) : null}
            {issue.segmentId ? (
              <DetailField label={<FormattedMessage {...messages.fieldSegmentId} />}>
                <ReadOnlyValue value={issue.segmentId} empty={emptyValue} />
              </DetailField>
            ) : null}
            {issue.sourceText ? (
              <DetailField
                label={<FormattedMessage {...messages.fieldSourceText} />}
                className="sm:col-span-2"
              >
                <ReadOnlyValue value={issue.sourceText} empty={emptyValue} />
              </DetailField>
            ) : null}
            {issue.linkKind ? (
              <DetailField label={<FormattedMessage {...messages.fieldLink} />}>
                <ReadOnlyValue value={issue.linkKind} empty={emptyValue} />
              </DetailField>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
