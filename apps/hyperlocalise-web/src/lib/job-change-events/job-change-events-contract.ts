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

import { jobKindEnum, jobStatusEnum } from "@/lib/database/schema/enums";

/**
 * Job changes recorded in the same transaction as the write to `jobs`: by `insertJobs` and
 * `updateJobs` in `job-writes.ts`, and by the Go public API's job update.
 */
export const JOB_CHANGE_EVENT_TYPES = [
  "job.created",
  "job.status_changed",
  "job.assignee_changed",
] as const;

export type JobChangeEventType = (typeof JOB_CHANGE_EVENT_TYPES)[number];

export const JOB_STATUSES = jobStatusEnum.enumValues;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_KINDS = jobKindEnum.enumValues;
export type JobKind = (typeof JOB_KINDS)[number];

export type JobAssigneeType = "user" | "agent";

/** One row of `job_change_events`, as the dispatcher reads it. IDs and statuses only. */
export type JobChangeEventRecord = {
  id: string;
  organizationId: string;
  jobId: string;
  projectId: string | null;
  kind: JobKind;
  type: JobChangeEventType;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  assigneeType: JobAssigneeType | null;
  occurredAt: Date;
};

/**
 * What a job change looks like to the outside: the body of an outbound webhook and the input of
 * a `trigger.job_changed` workflow run. Never add source text, filenames, or user details here.
 */
export type JobChangeEventPayload = {
  id: string;
  type: JobChangeEventType;
  createdAt: string;
  data: {
    job: {
      id: string;
      projectId: string | null;
      kind: JobKind;
      status: JobStatus;
      previousStatus: JobStatus | null;
      assigneeType: JobAssigneeType | null;
    };
  };
};

export function toJobChangeEventPayload(event: JobChangeEventRecord): JobChangeEventPayload {
  return {
    id: event.id,
    type: event.type,
    createdAt: event.occurredAt.toISOString(),
    data: {
      job: {
        id: event.jobId,
        projectId: event.projectId,
        kind: event.kind,
        status: event.toStatus,
        previousStatus: event.fromStatus,
        assigneeType: event.assigneeType,
      },
    },
  };
}

export function isJobChangeEventType(value: string): value is JobChangeEventType {
  return (JOB_CHANGE_EVENT_TYPES as readonly string[]).includes(value);
}
