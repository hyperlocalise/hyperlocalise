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
import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { ActivityLogList, type ActivityLogItem } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/settings/_components/activity-log-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { isContentEditorAllFilesSourcePath } from "@/lib/projects/content-editor-all-files";

import { contentEditorActivityLogDialogMessages as messages } from "./content-editor-activity-log-dialog.messages";

type ActivityLogResponse = {
  activityLogs: ActivityLogItem[];
  nextCursor: string | null;
};

export function ContentEditorActivityLogDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  sourcePath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
}) {
  const intl = useIntl();
  const allFiles = isContentEditorAllFilesSourcePath(sourcePath);

  const activityQuery = useInfiniteQuery({
    queryKey: ["content-editor-activity-logs", organizationSlug, projectId, sourcePath] as const,
    enabled: open,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].files
        .detail.cat["activity-logs"].$get({
          param: { organizationSlug, projectId },
          query: {
            cursor: pageParam,
            limit: "50",
            sourcePath: allFiles ? undefined : sourcePath,
          },
        });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.loadError));
      }
      return (await response.json()) as ActivityLogResponse;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const activityLogs = useMemo(
    () => activityQuery.data?.pages.flatMap((page) => page.activityLogs) ?? [],
    [activityQuery.data?.pages],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(40rem,calc(100vh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage
              {...(allFiles ? messages.allFilesDescription : messages.description)}
            />
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {activityQuery.isPending ? (
            <div className="flex items-center justify-center gap-2 px-6 py-12 text-muted-foreground">
              <Spinner className="size-4" />
              <TypographyP size="small">
                <FormattedMessage {...messages.loading} />
              </TypographyP>
            </div>
          ) : null}
          {activityQuery.isError ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12">
              <TypographyP size="small">
                <FormattedMessage {...messages.loadError} />
              </TypographyP>
              <Button type="button" variant="outline" size="sm" onClick={() => activityQuery.refetch()}>
                <FormattedMessage {...messages.retry} />
              </Button>
            </div>
          ) : null}
          {activityQuery.isSuccess && activityLogs.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
              <TypographyP weight="medium">
                <FormattedMessage {...messages.emptyTitle} />
              </TypographyP>
              <TypographyP size="small" tone="muted">
                <FormattedMessage {...messages.emptyDescription} />
              </TypographyP>
            </div>
          ) : null}
          {activityLogs.length > 0 ? (
            <ActivityLogList activityLogs={activityLogs} framed={false} />
          ) : null}
          {activityQuery.hasNextPage ? (
            <div className="flex justify-center border-t border-border px-6 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={activityQuery.isFetchingNextPage}
                onClick={() => activityQuery.fetchNextPage()}
              >
                {activityQuery.isFetchingNextPage ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <FormattedMessage {...messages.loadMore} />
                )}
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
