"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import { apiClient } from "@/lib/api-client-instance";
import type { TmsProviderLiveJobComment } from "@/lib/providers/jobs/tms-provider-live";

import { formatJobDetailDate } from "../job-detail-types";
import { tmsLiveJobCommentsSectionMessages as messages } from "./tms-live-job-comments-section.messages";

function tmsLiveJobCommentsQueryKey(organizationSlug: string, encodedJobId: string) {
  return ["tms-provider-job-comments", organizationSlug, encodedJobId] as const;
}

function formatTimeSpent(seconds: number | null, intl: IntlShape) {
  if (!seconds || seconds <= 0) {
    return null;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return intl.formatMessage(messages.timeSpentMinutes, { minutes });
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? intl.formatMessage(messages.timeSpentHoursMinutes, {
        hours,
        minutes: remainingMinutes,
      })
    : intl.formatMessage(messages.timeSpentHours, { hours });
}

export function TmsLiveJobCommentsSection({
  organizationSlug,
  encodedJobId,
}: {
  organizationSlug: string;
  encodedJobId: string;
}) {
  const intl = useIntl();
  const commentsQuery = useQuery({
    queryKey: tmsLiveJobCommentsQueryKey(organizationSlug, encodedJobId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
        ":encodedJobId"
      ].comments.$get({
        param: { organizationSlug, encodedJobId },
      });

      if (!response.ok) {
        throw new Error(
          intl.formatMessage(messages.failedToLoadComments, { status: response.status }),
        );
      }

      const body = (await response.json()) as { comments: TmsProviderLiveJobComment[] };
      return body.comments;
    },
  });

  if (commentsQuery.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        <FormattedMessage {...messages.loadingComments} />
      </p>
    );
  }

  if (commentsQuery.isError) {
    return (
      <p className="text-sm text-flame-100">
        <FormattedMessage {...messages.unableToLoadComments} />
      </p>
    );
  }

  const comments = commentsQuery.data ?? [];

  if (comments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        <FormattedMessage {...messages.noCommentsYet} />
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-card">
      {comments.map((comment) => {
        const timeSpent = formatTimeSpent(comment.timeSpentSeconds, intl);

        return (
          <li key={comment.id} className="px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">
                <FormattedMessage {...messages.userLabel} values={{ userId: comment.userId }} />
              </span>
              <span className="text-xs text-muted-foreground">
                {formatJobDetailDate(comment.createdAt)}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
              {comment.text}
            </p>
            {timeSpent ? (
              <p className="mt-2 text-xs text-muted-foreground">
                <FormattedMessage {...messages.timeSpentLabel} values={{ duration: timeSpent }} />
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
