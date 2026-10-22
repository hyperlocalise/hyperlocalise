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
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { ActivityLogList } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/settings/_components/activity-log-list";
import type { ContentEditorProjectSource } from "@/components/content-editor/shared/content-editor-native-project";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { fetchContentEditorActivityLogs } from "./content-editor-activity-log-api";
import { contentEditorActivityLogMessages as messages } from "./content-editor-activity-log.messages";

const SEGMENT_ACTIVITY_PAGE_SIZE = 25;

/** Activity on one string in one locale, for native and connected TMS projects. */
export function ContentEditorSegmentActivityTab({
  organizationSlug,
  projectId,
  projectSource,
  sourcePath,
  segmentId,
  targetLocale,
}: {
  organizationSlug: string;
  projectId: string;
  projectSource: ContentEditorProjectSource;
  sourcePath: string;
  segmentId: string;
  targetLocale: string;
}) {
  const intl = useIntl();
  const { client: goSvcClient } = useGoSvcClient();
  const [now] = useState(() => Date.now());

  const activityQuery = useInfiniteQuery({
    queryKey: [
      "content-editor-segment-activity-logs",
      organizationSlug,
      projectId,
      sourcePath,
      segmentId,
      targetLocale,
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchContentEditorActivityLogs({
        goSvcClient,
        organizationSlug,
        projectId,
        projectSource,
        query: {
          sourcePath,
          segmentId,
          targetLocale,
          cursor: pageParam,
          limit: SEGMENT_ACTIVITY_PAGE_SIZE,
        },
        errorMessage: intl.formatMessage(messages.loadError),
        signal,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  if (activityQuery.isPending) {
    return (
      <div className="flex items-center gap-2 py-4" role="status">
        <Spinner className="size-4" />
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.loading} />
        </TypographyP>
      </div>
    );
  }

  if (activityQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-3 py-4" role="alert">
        <TypographyP size="small" weight="medium" tone="critical">
          <FormattedMessage {...messages.loadError} />
        </TypographyP>
        <Button type="button" variant="outline" size="sm" onClick={() => activityQuery.refetch()}>
          <FormattedMessage {...messages.retry} />
        </Button>
      </div>
    );
  }

  const activityLogs = activityQuery.data.pages.flatMap((page) => page.activityLogs);
  if (activityLogs.length === 0) {
    return (
      <div className="flex flex-col gap-1 py-4">
        <TypographyP size="small" weight="medium" tone="content">
          <FormattedMessage {...messages.emptyTitle} />
        </TypographyP>
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.segmentEmptyDescription} />
        </TypographyP>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ActivityLogList
        activityLogs={activityLogs}
        now={now}
        organizationSlug={organizationSlug}
        variant="plain"
      />
      {activityQuery.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-center"
          onClick={() => activityQuery.fetchNextPage()}
          disabled={activityQuery.isFetchingNextPage}
        >
          {activityQuery.isFetchingNextPage ? (
            <Spinner className="size-3.5" />
          ) : (
            <FormattedMessage {...messages.loadMore} />
          )}
        </Button>
      ) : null}
    </div>
  );
}
