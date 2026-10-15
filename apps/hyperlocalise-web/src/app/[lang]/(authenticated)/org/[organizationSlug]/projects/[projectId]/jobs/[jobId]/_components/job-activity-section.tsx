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
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";

import { useAssignableIssueMembersQuery } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_components/issue-detail/use-assignable-issue-members";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { buildJobDetailHref } from "../../../../../jobs/_components/jobs-view-helpers";
import { buildJobActivity, hasTerminalJobEvent, shouldPollJobEvents } from "./build-job-activity";
import { JobActivityView } from "./job-activity-view";
import type { JobDetailRecord } from "./job-detail-types";
import { isNativeFileTranslationJob } from "./native-job-detail-helpers";

export const JOB_ACTIVITY_POLL_INTERVAL_MS = 3000;

export function hasJobActivityFeed(job: JobDetailRecord) {
  return job.kind === "translation" && isNativeFileTranslationJob(job);
}

export function JobActivitySection({
  organizationSlug,
  projectId,
  job,
}: {
  organizationSlug: string;
  projectId: string;
  job: Pick<JobDetailRecord, "id" | "status" | "workflowRunId" | "createdAt" | "createdByUserId">;
}) {
  const { client: goSvcClient } = useGoSvcClient();
  const terminalEventWaitStartedAt = useRef<number | null>(null);

  const eventsQuery = useQuery({
    queryKey: ["job-events", organizationSlug, job.id, job.status, job.workflowRunId],
    queryFn: () => goSvcClient.job.listEvents(organizationSlug, job.id),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const events = query.state.data?.events;
      const waitingForTerminalEventMs = terminalEventWaitStartedAt.current
        ? Date.now() - terminalEventWaitStartedAt.current
        : 0;
      return shouldPollJobEvents(job.status, events, {
        waitingForTerminalEventMs,
        workflowRunId: job.workflowRunId,
      })
        ? JOB_ACTIVITY_POLL_INTERVAL_MS
        : false;
    },
  });

  const events = eventsQuery.data?.events;
  if (
    (job.status === "succeeded" || job.status === "failed") &&
    !hasTerminalJobEvent(events, job.workflowRunId)
  ) {
    terminalEventWaitStartedAt.current ??= Date.now();
  } else {
    terminalEventWaitStartedAt.current = null;
  }
  const membersQuery = useAssignableIssueMembersQuery({ organizationSlug, projectId });

  const items = useMemo(
    () => (events ? buildJobActivity(events, { jobStatus: job.status }) : null),
    [events, job.status],
  );
  const memberNames = useMemo(
    () => new Map((membersQuery.data?.members ?? []).map((m) => [m.userId, m.displayName])),
    [membersQuery.data],
  );
  const resolveActorName = (userId: string | null) =>
    userId ? (memberNames.get(userId) ?? null) : null;

  return (
    <JobActivityView
      items={items}
      createdAt={job.createdAt}
      createdByName={resolveActorName(job.createdByUserId)}
      resolveActorName={resolveActorName}
      buildJobHref={(jobId) => buildJobDetailHref(organizationSlug, projectId, jobId)}
      loadFailed={eventsQuery.isError && !events}
      now={eventsQuery.dataUpdatedAt || Date.now()}
    />
  );
}
