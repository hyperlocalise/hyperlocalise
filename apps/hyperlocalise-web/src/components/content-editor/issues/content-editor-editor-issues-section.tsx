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
import { useEffect, useEffectEvent, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useRouter } from "next/navigation";
import { FormattedMessage, useIntl } from "react-intl";
import { Cancel01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
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
import { isOpenIssueStatus } from "@/components/content-editor/queue/content-editor-queue-filter";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";

import {
  CAT_ISSUE_GUIDANCE_OPEN_EVENT,
  EMPTY_CAT_ISSUE_GUIDANCE_STATUS,
  setCatIssueGuidanceStatus,
} from "./content-editor-issue-guidance-event";
import { contentEditorEditorIssuesSectionMessages as messages } from "./content-editor-editor-issues-section.messages";

type ContentEditorIssueSheetListResponse = InferResponseType<
  (typeof apiClient.api.orgs)[":organizationSlug"]["projects"][":projectId"]["issue-sheet"]["$get"],
  200
>;

/** Maximum accepted by the issue sheet list endpoint. */
const SEGMENT_ISSUE_PAGE_SIZE = 100;
/** Bounds the paging loop; one string in one locale never gets close to this. */
const SEGMENT_ISSUE_MAX_PAGES = 5;
const ISSUE_PANEL_FRAME_CLASSNAME =
  "fixed inset-x-2 bottom-[calc(var(--app-shell-plan-footer-height)+0.5rem)] z-50 flex h-[min(44rem,calc(100svh-var(--app-shell-plan-footer-height)-1rem))] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/15 sm:inset-x-auto sm:right-3 sm:w-[38rem]";

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

export function ContentEditorEditorIssuesSection({
  organizationSlug,
  projectId,
  translationKeyId,
  targetLocale,
  stringLink,
  canCreate,
  onOpenIssueCountChange,
  open = false,
  onOpenChange,
}: {
  organizationSlug: string;
  projectId: string;
  translationKeyId: string | null;
  targetLocale: string | null;
  stringLink: IssueSheetCreateStringLink | null;
  canCreate: boolean;
  onOpenIssueCountChange?: (openIssueCount: number) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const intl = useIntl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const requestFailed = intl.formatMessage(messages.requestFailed);
  const openIssueGuidance = useEffectEvent(() => {
    onOpenChange?.(true);
  });
  const reportOpenIssueCount = useEffectEvent((openCount: number) => {
    onOpenIssueCountChange?.(openCount);
  });

  useEffect(() => {
    function handleOpenIssueGuidance() {
      openIssueGuidance();
    }

    window.addEventListener(CAT_ISSUE_GUIDANCE_OPEN_EVENT, handleOpenIssueGuidance);
    return () => {
      window.removeEventListener(CAT_ISSUE_GUIDANCE_OPEN_EVENT, handleOpenIssueGuidance);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setCreateOpen(false);
    }
  }, [open]);

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
      const issues: ContentEditorIssueSheetListResponse["issues"] = [];

      for (let page = 0; page < SEGMENT_ISSUE_MAX_PAGES; page += 1) {
        const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
          "issue-sheet"
        ].$get({
          param: { organizationSlug, projectId },
          query: {
            ...apiQuery,
            offset: String(page * SEGMENT_ISSUE_PAGE_SIZE),
          },
        } as never);
        if (response.status !== 200) {
          throw new Error(
            (await readApiResponseError(response, requestFailed)).message || requestFailed,
          );
        }
        const body = await response.json();
        issues.push(...body.issues);

        const total = body.total ?? issues.length;
        if (body.issues.length === 0 || issues.length >= total) {
          break;
        }
      }

      return { issues };
    },
  });

  const listIssues: IssueGroupedListItem[] = useMemo(
    () =>
      (issuesQuery.data?.issues ?? []).map((issue) => ({
        id: issue.id,
        identifier: issue.identifier,
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
  const openIssueCount = (issuesQuery.data?.issues ?? []).filter((issue) =>
    isOpenIssueStatus(issue.status),
  ).length;

  useEffect(() => {
    if (issuesQuery.data) {
      reportOpenIssueCount(openIssueCount);
    }
    setCatIssueGuidanceStatus({ available: true, openIssueCount });
  }, [issuesQuery.data, openIssueCount]);

  useEffect(() => {
    return () => setCatIssueGuidanceStatus(EMPTY_CAT_ISSUE_GUIDANCE_STATUS);
  }, []);

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["issue-sheet", organizationSlug, projectId],
    });
  };

  if (!open) {
    return null;
  }

  if (!translationKeyId) {
    return (
      <IssuePanelFrame canCreate={false} onClose={() => onOpenChange?.(false)}>
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <div className="w-full rounded-xl border bg-card px-4 py-12 text-center">
            <p className="text-sm font-medium text-foreground">
              <FormattedMessage {...messages.unavailable} />
            </p>
          </div>
        </div>
      </IssuePanelFrame>
    );
  }

  return (
    <IssuePanelFrame
      canCreate={canCreate && Boolean(stringLink)}
      onCreate={() => setCreateOpen(true)}
      onClose={() => onOpenChange?.(false)}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
      </div>

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
    </IssuePanelFrame>
  );
}

function IssuePanelFrame({
  canCreate,
  onCreate,
  onClose,
  children,
}: {
  canCreate: boolean;
  onCreate?: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const intl = useIntl();

  return (
    <section
      className={ISSUE_PANEL_FRAME_CLASSNAME}
      aria-label={intl.formatMessage(messages.title)}
    >
      <IssuePanelHeader canCreate={canCreate} onCreate={onCreate} onClose={onClose} />
      {children}
    </section>
  );
}

function IssuePanelHeader({
  canCreate,
  onCreate,
  onClose,
}: {
  canCreate: boolean;
  onCreate?: () => void;
  onClose: () => void;
}) {
  const intl = useIntl();

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
      <h2 className="min-w-0 flex-1 truncate text-base font-medium text-foreground">
        <FormattedMessage {...messages.title} />
      </h2>
      {canCreate && onCreate ? (
        <Button type="button" variant="ghost" size="sm" onClick={onCreate}>
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
          <FormattedMessage {...messages.createIssue} />
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={intl.formatMessage(messages.close)}
        onClick={onClose}
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
      </Button>
    </header>
  );
}
