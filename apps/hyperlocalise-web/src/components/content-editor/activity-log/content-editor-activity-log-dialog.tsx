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
import { HistoryIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  ActivityLogList,
  type ActivityLogItem,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/settings/_components/activity-log-list";
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

import { contentEditorActivityLogMessages as messages } from "./content-editor-activity-log.messages";

type ActivityLogResponse = {
  activityLogs: ActivityLogItem[];
  nextCursor: string | null;
};

function contentEditorActivityLogsQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath: string,
) {
  return ["content-editor-activity-logs", organizationSlug, projectId, sourcePath] as const;
}

export function ContentEditorActivityLogButton({
  organizationSlug,
  projectId,
  sourcePath,
}: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const [now] = useState(() => Date.now());
  const allFiles = isContentEditorAllFilesSourcePath(sourcePath);

  const activityQuery = useInfiniteQuery({
    queryKey: contentEditorActivityLogsQueryKey(organizationSlug, projectId, sourcePath),
    initialPageParam: undefined as string | undefined,
    enabled: open,
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].files.detail.cat["activity-logs"].$get({
        param: { organizationSlug, projectId },
        query: {
          sourcePath,
          cursor: pageParam,
          limit: "50",
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
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="size-8 shrink-0"
        aria-label={intl.formatMessage(messages.openAria)}
        title={intl.formatMessage(messages.openAria)}
        onClick={() => setOpen(true)}
      >
        <HugeiconsIcon icon={HistoryIcon} className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.title} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage
                {...(allFiles ? messages.allFilesDescription : messages.description)}
              />
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[min(28rem,60vh)] overflow-y-auto">
            {activityQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-8">
                <Spinner className="size-4" />
                <TypographyP size="small" tone="subtle">
                  <FormattedMessage {...messages.loading} />
                </TypographyP>
              </div>
            ) : activityQuery.isError ? (
              <div className="flex flex-col items-start gap-3 py-4">
                <TypographyP size="small" weight="medium" tone="critical">
                  <FormattedMessage {...messages.loadError} />
                </TypographyP>
                <Button type="button" variant="outline" size="sm" onClick={() => activityQuery.refetch()}>
                  <FormattedMessage {...messages.retry} />
                </Button>
              </div>
            ) : activityLogs.length === 0 ? (
              <div className="flex flex-col gap-1 py-4">
                <TypographyP size="small" weight="medium" tone="content">
                  <FormattedMessage {...messages.emptyTitle} />
                </TypographyP>
                <TypographyP size="small" tone="subtle">
                  <FormattedMessage {...messages.emptyDescription} />
                </TypographyP>
              </div>
            ) : (
              <ActivityLogList activityLogs={activityLogs} now={now} variant="plain" />
            )}
          </div>

          {activityQuery.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => activityQuery.fetchNextPage()}
                disabled={activityQuery.isFetchingNextPage}
              >
                {activityQuery.isFetchingNextPage ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <FormattedMessage {...messages.loadMore} />
                )}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
