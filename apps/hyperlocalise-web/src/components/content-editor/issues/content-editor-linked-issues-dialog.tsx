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

import {
  IssueSheetCreateIssueDialog,
  type IssueSheetCreateStringLink,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/issue-sheet/_components/issue-sheet-create-issue-dialog";
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
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { contentEditorLinkedIssuesDialogMessages as messages } from "./content-editor-linked-issues-dialog.messages";

export type ContentEditorLinkedIssueSegmentContext = {
  segmentId: string;
  segmentKey: string;
  sourceText: string;
  translationKeyId: string | null;
  targetLocale: string;
  sourcePath: string;
};

export function ContentEditorLinkedIssuesDialog({
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
  segment: ContentEditorLinkedIssueSegmentContext | null;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
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
      try {
        const body = await goSvcClient.issueSheet.list(organizationSlug, projectId, {
          translationKeyId: translationKeyId!,
          status: "all",
          sort: "updated_at",
          sortDir: "desc",
          limit: 50,
        });
        return body.issues;
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.requestFailed)), {
          cause: error,
        });
      }
    },
  });

  const searchIssuesQuery = useQuery({
    queryKey: ["cat-linkable-issues", organizationSlug, projectId, linkSearch],
    enabled: open && linkPickerOpen && canManageLinks,
    queryFn: async () => {
      try {
        const body = await goSvcClient.issueSheet.list(organizationSlug, projectId, {
          status: "all",
          sort: "updated_at",
          sortDir: "desc",
          limit: 25,
          ...(linkSearch.trim() ? { search: linkSearch.trim() } : {}),
        });
        return body.issues;
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.requestFailed)), {
          cause: error,
        });
      }
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
      try {
        return await goSvcClient.issueSheet.update(organizationSlug, projectId, issueId, {
          translationKeyId: segment.translationKeyId,
          segmentId: segment.segmentId,
          sourcePath: segment.sourcePath,
          targetLocale: segment.targetLocale,
          linkKind: "content_editor_segment",
        });
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.linkFailed)), {
          cause: error,
        });
      }
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
      try {
        return await goSvcClient.issueSheet.update(organizationSlug, projectId, issueId, {
          translationKeyId: null,
        });
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.unlinkFailed)), {
          cause: error,
        });
      }
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

  // Keep a stable identity so the create form does not reinitialize (and discard
  // in-progress edits) whenever this dialog rerenders.
  const createStringLink = useMemo<IssueSheetCreateStringLink | null>(() => {
    if (!segment) {
      return null;
    }

    return {
      translationKeyId: segment.translationKeyId ?? undefined,
      segmentId: segment.segmentId,
      sourcePath: segment.sourcePath,
      targetLocale: segment.targetLocale,
      defaultTitle: intl.formatMessage(messages.defaultTitle, { key: segment.segmentKey }),
      // Source material the create dialog quotes below the applied template's description
      // skeleton, not the literal description — the only place source survives for segments
      // without a translationKeyId once a template takes over the description.
      defaultDescription: segment.sourceText,
    };
  }, [intl, segment]);

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

      {createStringLink ? (
        <IssueSheetCreateIssueDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          organizationSlug={organizationSlug}
          projectId={projectId}
          stringLink={createStringLink}
          // CAT's fixed default, independent of the project's configured default template. Still
          // swappable or removable in the dialog before creating.
          initialTemplateKey="tpl_context_request"
          onCreated={async () => {
            await invalidateLinked();
          }}
        />
      ) : null}
    </>
  );
}
