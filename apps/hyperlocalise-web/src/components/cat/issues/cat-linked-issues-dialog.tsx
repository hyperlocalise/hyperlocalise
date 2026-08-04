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
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { IssueSheetCreateIssueDialog } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/issue-sheet/_components/issue-sheet-create-issue-dialog";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { readApiResponseError } from "@/lib/api-error";

import { catLinkedIssuesDialogMessages as messages } from "./cat-linked-issues-dialog.messages";

export type CatLinkedIssueSegmentContext = {
  segmentId: string;
  segmentKey: string;
  sourceText: string;
  translationKeyId: string | null;
  targetLocale: string;
  sourcePath: string;
  linkUrl: string | null;
  linkLabel: string;
};

type LinkedIssueListItem = {
  id: string;
  title: string;
  status: string;
  translationKeyId: string | null;
};

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

export function CatLinkedIssuesDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  segment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId: string;
  segment: CatLinkedIssueSegmentContext | null;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");

  const translationKeyId = segment?.translationKeyId ?? null;
  const canManageLinks = Boolean(translationKeyId);

  const linkedQueryKey = useMemo(
    () => ["cat-linked-issues", organizationSlug, projectId, translationKeyId] as const,
    [organizationSlug, projectId, translationKeyId],
  );

  const linkedIssuesQuery = useQuery({
    queryKey: linkedQueryKey,
    enabled: open && Boolean(translationKeyId),
    queryFn: async () => {
      const params = new URLSearchParams({
        translationKeyId: translationKeyId!,
        status: "all",
        sort: "updated_at",
        sortDir: "desc",
        limit: "50",
      });
      const response = await fetch(
        `${issueSheetPath(organizationSlug, projectId)}?${params.toString()}`,
      );
      const body = await readJsonOrThrow<{ issues: LinkedIssueListItem[] }>(
        response,
        intl.formatMessage(messages.requestFailed),
      );
      return body.issues;
    },
  });

  const searchIssuesQuery = useQuery({
    queryKey: ["cat-linkable-issues", organizationSlug, projectId, linkSearch],
    enabled: open && linkPickerOpen && canManageLinks,
    queryFn: async () => {
      const params = new URLSearchParams({
        status: "all",
        sort: "updated_at",
        sortDir: "desc",
        limit: "25",
      });
      if (linkSearch.trim()) {
        params.set("search", linkSearch.trim());
      }
      const response = await fetch(
        `${issueSheetPath(organizationSlug, projectId)}?${params.toString()}`,
      );
      const body = await readJsonOrThrow<{ issues: LinkedIssueListItem[] }>(
        response,
        intl.formatMessage(messages.requestFailed),
      );
      return body.issues;
    },
  });

  const invalidateLinked = async () => {
    await queryClient.invalidateQueries({ queryKey: linkedQueryKey });
  };

  const linkIssue = useMutation({
    mutationFn: async (issueId: string) => {
      if (!segment?.translationKeyId) {
        throw new Error(intl.formatMessage(messages.linkingUnavailable));
      }
      const response = await fetch(
        `${issueSheetPath(organizationSlug, projectId)}/${encodeURIComponent(issueId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            translationKeyId: segment.translationKeyId,
            segmentId: segment.segmentId,
            sourcePath: segment.sourcePath,
            targetLocale: segment.targetLocale,
            linkKind: "cat_segment",
            linkLabel: segment.linkLabel,
            linkUrl: segment.linkUrl,
          }),
        },
      );
      return readJsonOrThrow<{ issue: LinkedIssueListItem }>(
        response,
        intl.formatMessage(messages.linkFailed),
      );
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.linked));
      setLinkPickerOpen(false);
      setLinkSearch("");
      await invalidateLinked();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.linkFailed)),
  });

  const unlinkIssue = useMutation({
    mutationFn: async (issueId: string) => {
      const response = await fetch(
        `${issueSheetPath(organizationSlug, projectId)}/${encodeURIComponent(issueId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ translationKeyId: null }),
        },
      );
      return readJsonOrThrow<{ issue: LinkedIssueListItem }>(
        response,
        intl.formatMessage(messages.unlinkFailed),
      );
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.unlinked));
      await invalidateLinked();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.unlinkFailed),
      ),
  });

  const linkedIds = new Set((linkedIssuesQuery.data ?? []).map((issue) => issue.id));
  const linkCandidates = (searchIssuesQuery.data ?? []).filter(
    (issue) => !linkedIds.has(issue.id) && issue.translationKeyId !== translationKeyId,
  );

  const issueDetailHref = (issueId: string) =>
    `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/issue-sheet/${encodeURIComponent(issueId)}`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>
              <FormattedMessage {...messages.title} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.description} />
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 border-b border-border px-6 py-3">
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)} disabled={!segment}>
              <FormattedMessage {...messages.createIssue} />
            </Button>
            {canManageLinks ? (
              <Popover open={linkPickerOpen} onOpenChange={setLinkPickerOpen}>
                <PopoverTrigger
                  render={<Button type="button" size="sm" variant="outline" disabled={!segment} />}
                >
                  <FormattedMessage {...messages.linkExisting} />
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder={intl.formatMessage(messages.searchIssues)}
                      value={linkSearch}
                      onValueChange={setLinkSearch}
                    />
                    <CommandList>
                      {searchIssuesQuery.isLoading ? (
                        <div className="flex justify-center py-6">
                          <Spinner className="size-4" />
                        </div>
                      ) : (
                        <>
                          <CommandEmpty>
                            <FormattedMessage {...messages.noMatches} />
                          </CommandEmpty>
                          <CommandGroup>
                            {linkCandidates.map((issue) => (
                              <CommandItem
                                key={issue.id}
                                value={issue.id}
                                disabled={linkIssue.isPending}
                                onSelect={() => linkIssue.mutate(issue.id)}
                              >
                                <span className="truncate">{issue.title}</span>
                                <span className="ms-auto text-xs text-muted-foreground">
                                  {issue.status}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {!canManageLinks ? (
              <p className="text-sm text-muted-foreground">
                <FormattedMessage {...messages.linkingUnavailable} />
              </p>
            ) : linkedIssuesQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner className="size-5" />
              </div>
            ) : linkedIssuesQuery.isError ? (
              <p className="text-sm text-destructive">
                <FormattedMessage {...messages.loadError} />
              </p>
            ) : (linkedIssuesQuery.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                <FormattedMessage {...messages.emptyLinked} />
              </p>
            ) : (
              <ul className="space-y-2">
                {linkedIssuesQuery.data?.map((issue) => (
                  <li
                    key={issue.id}
                    className="flex items-start gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{issue.title}</p>
                      <p className="text-xs text-muted-foreground">{issue.status}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      nativeButton={false}
                      render={<a href={issueDetailHref(issue.id)} />}
                    >
                      <FormattedMessage {...messages.openIssue} />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={unlinkIssue.isPending}
                      onClick={() => unlinkIssue.mutate(issue.id)}
                    >
                      <FormattedMessage {...messages.unlink} />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {segment ? (
        <IssueSheetCreateIssueDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          organizationSlug={organizationSlug}
          projectId={projectId}
          stringLink={{
            translationKeyId: segment.translationKeyId ?? undefined,
            segmentId: segment.segmentId,
            sourcePath: segment.sourcePath,
            targetLocale: segment.targetLocale,
            defaultTitle: intl.formatMessage(messages.defaultTitle, {
              key: segment.segmentKey,
            }),
            defaultDescription: segment.sourceText,
            linkUrl: segment.linkUrl ?? undefined,
            linkLabel: segment.linkLabel,
          }}
          onCreated={async () => {
            await invalidateLinked();
          }}
        />
      ) : null}
    </>
  );
}
