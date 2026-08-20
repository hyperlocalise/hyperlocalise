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
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FormattedMessage, useIntl } from "react-intl";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  IssueGroupedList,
  type IssueGroupedListItem,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_components/issue-grouped-list";
import { buildIssueDetailHref } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_components/issue-detail/issue-detail-utils";
import {
  IssueSheetCreateIssueDialog,
  type IssueSheetCreateStringLink,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/issue-sheet/_components/issue-sheet-create-issue-dialog";
import { Button } from "@/components/ui/button";
import { isOpenIssueStatus } from "@/components/cat/queue/cat-queue-filter";
import { readApiResponseError } from "@/lib/api-error";

import { catEditorIssuesSectionMessages as messages } from "./cat-editor-issues-section.messages";

type IssueSheetListIssue = {
  id: string;
  title: string;
  status: string;
  targetLocale: string | null;
  assignee: string | null;
  assigneeUserId: string | null;
  updatedAt: string;
  values?: Record<string, unknown>;
};

type IssueSheetListResponse = {
  issues: IssueSheetListIssue[];
  /** Row count for the requested filters, independent of paging. */
  total?: number;
};

/** Maximum accepted by the issue sheet list endpoint. */
const SEGMENT_ISSUE_PAGE_SIZE = 100;
/** Bounds the paging loop; one string in one locale never gets close to this. */
const SEGMENT_ISSUE_MAX_PAGES = 5;

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

export function CatEditorIssuesSection({
  organizationSlug,
  projectId,
  translationKeyId,
  targetLocale,
  stringLink,
  canCreate,
  onOpenIssueCountChange,
}: {
  organizationSlug: string;
  projectId: string;
  translationKeyId: string | null;
  targetLocale: string | null;
  stringLink: IssueSheetCreateStringLink | null;
  canCreate: boolean;
  onOpenIssueCountChange?: (openIssueCount: number) => void;
}) {
  const intl = useIntl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const requestFailed = intl.formatMessage(messages.requestFailed);

  // A translation key is shared across locales, so scope to the locale being
  // edited to match the segment the panel is showing.
  const apiQuery = useMemo(() => {
    const query: Record<string, string> = {
      status: "all",
      sort: "status",
      sortDir: "asc",
      limit: String(SEGMENT_ISSUE_PAGE_SIZE),
    };
    if (translationKeyId) {
      query.translationKeyId = translationKeyId;
    }
    if (targetLocale) {
      query.locale = targetLocale;
    }
    return query;
  }, [targetLocale, translationKeyId]);

  // Share the `issue-sheet` key prefix so issue mutations elsewhere (assignee
  // edits, status changes) patch and invalidate this list too.
  const queryKey = useMemo(
    () => ["issue-sheet", organizationSlug, projectId, apiQuery] as const,
    [apiQuery, organizationSlug, projectId],
  );

  const issuesQuery = useQuery({
    queryKey,
    enabled: Boolean(translationKeyId),
    // The endpoint's `summary` counts the whole project, so status group counts
    // and the open-issue badge have to come from the rows themselves. Page until
    // the segment's filtered `total` is covered rather than showing a truncated
    // first page as if it were everything.
    queryFn: async () => {
      const issues: IssueSheetListIssue[] = [];

      for (let page = 0; page < SEGMENT_ISSUE_MAX_PAGES; page += 1) {
        const params = new URLSearchParams(apiQuery);
        params.set("offset", String(page * SEGMENT_ISSUE_PAGE_SIZE));
        const response = await fetch(
          `${issueSheetPath(organizationSlug, projectId)}?${params.toString()}`,
        );
        const body = await readJsonOrThrow<IssueSheetListResponse>(response, requestFailed);
        issues.push(...body.issues);

        const total = body.total ?? issues.length;
        if (body.issues.length === 0 || issues.length >= total) {
          break;
        }
      }

      return { issues } satisfies IssueSheetListResponse;
    },
  });

  const listIssues: IssueGroupedListItem[] = useMemo(
    () =>
      (issuesQuery.data?.issues ?? []).map((issue) => ({
        id: issue.id,
        projectId,
        title: issue.title,
        status: issue.status,
        targetLocale: issue.targetLocale,
        assignee: issue.assignee,
        assigneeUserId: issue.assigneeUserId,
        updatedAt: issue.updatedAt,
        priority: cellString(issue.values?.priority) || null,
      })),
    [issuesQuery.data?.issues, projectId],
  );

  useEffect(() => {
    if (!onOpenIssueCountChange || !translationKeyId) {
      return;
    }
    if (!issuesQuery.data) {
      return;
    }
    const openCount = (issuesQuery.data.issues ?? []).filter((issue) =>
      isOpenIssueStatus(issue.status),
    ).length;
    onOpenIssueCountChange(openCount);
  }, [issuesQuery.data, onOpenIssueCountChange, translationKeyId]);

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["issue-sheet", organizationSlug, projectId],
    });
  };

  if (!translationKeyId) {
    return (
      <section className="space-y-3 border-t border-border pt-5">
        <h3 className="text-xs font-medium text-muted-foreground">
          <FormattedMessage {...messages.title} />
        </h3>
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.unavailable} />
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          <FormattedMessage {...messages.title} />
        </h3>
        {canCreate && stringLink ? (
          <Button variant="ghost" size="sm" onClick={() => setCreateOpen(true)}>
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
            <FormattedMessage {...messages.createIssue} />
          </Button>
        ) : null}
      </div>

      <IssueGroupedList
        organizationSlug={organizationSlug}
        issues={listIssues}
        showProject={false}
        isLoading={issuesQuery.isLoading}
        isError={issuesQuery.isError}
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
          <div className="px-1 py-2">
            <p className="text-sm font-medium text-foreground">
              <FormattedMessage {...messages.emptyTitle} />
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              <FormattedMessage {...messages.emptyDescription} />
            </p>
          </div>
        }
        error={<FormattedMessage {...messages.loadError} />}
      />

      {stringLink ? (
        <IssueSheetCreateIssueDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          organizationSlug={organizationSlug}
          projectId={projectId}
          stringLink={stringLink}
          // CAT's fixed default, independent of the project's configured default template. Still
          // swappable or removable in the dialog before creating.
          initialTemplateKey="tpl_context_request"
          onCreated={refresh}
        />
      ) : null}
    </section>
  );
}
