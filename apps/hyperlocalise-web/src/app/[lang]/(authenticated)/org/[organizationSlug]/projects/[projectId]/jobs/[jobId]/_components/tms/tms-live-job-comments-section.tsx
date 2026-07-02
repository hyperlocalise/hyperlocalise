"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client-instance";
import type { TmsProviderLiveJobComment } from "@/lib/providers/tms-provider-live";

import { formatJobDetailDate } from "../job-detail-types";

function tmsLiveJobCommentsQueryKey(organizationSlug: string, encodedJobId: string) {
  return ["tms-provider-job-comments", organizationSlug, encodedJobId] as const;
}

function formatTimeSpent(seconds: number | null) {
  if (!seconds || seconds <= 0) {
    return null;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

export function TmsLiveJobCommentsSection({
  organizationSlug,
  encodedJobId,
}: {
  organizationSlug: string;
  encodedJobId: string;
}) {
  const commentsQuery = useQuery({
    queryKey: tmsLiveJobCommentsQueryKey(organizationSlug, encodedJobId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
        ":encodedJobId"
      ].comments.$get({
        param: { organizationSlug, encodedJobId },
      });

      if (!response.ok) {
        throw new Error(`Failed to load task comments (${response.status})`);
      }

      const body = (await response.json()) as { comments: TmsProviderLiveJobComment[] };
      return body.comments;
    },
  });

  if (commentsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading comments…</p>;
  }

  if (commentsQuery.isError) {
    return <p className="text-sm text-flame-100">Unable to load task comments.</p>;
  }

  const comments = commentsQuery.data ?? [];

  if (comments.length === 0) {
    return <p className="text-sm text-muted-foreground">No comments yet.</p>;
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-card">
      {comments.map((comment) => {
        const timeSpent = formatTimeSpent(comment.timeSpentSeconds);

        return (
          <li key={comment.id} className="px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">User {comment.userId}</span>
              <span className="text-xs text-muted-foreground">
                {formatJobDetailDate(comment.createdAt)}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
              {comment.text}
            </p>
            {timeSpent ? (
              <p className="mt-2 text-xs text-muted-foreground">Time spent: {timeSpent}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
