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
import { describe, expect, it } from "vite-plus/test";

import {
  JOB_CHANGE_EVENT_TYPES,
  isJobChangeEventType,
  toJobChangeEventPayload,
  type JobChangeEventRecord,
} from "./job-change-events-contract";

const event: JobChangeEventRecord = {
  id: "evt_1",
  organizationId: "org_secret",
  jobId: "job_1",
  projectId: "proj_1",
  kind: "translation",
  type: "job.status_changed",
  fromStatus: "running",
  toStatus: "succeeded",
  assigneeType: "user",
  occurredAt: new Date("2026-11-09T12:00:00.000Z"),
};

describe("toJobChangeEventPayload", () => {
  it("exports ids and statuses only — never org ids or assignee identity", () => {
    expect(toJobChangeEventPayload(event)).toEqual({
      id: "evt_1",
      type: "job.status_changed",
      createdAt: "2026-11-09T12:00:00.000Z",
      data: {
        job: {
          id: "job_1",
          projectId: "proj_1",
          kind: "translation",
          status: "succeeded",
          previousStatus: "running",
          assigneeType: "user",
        },
      },
    });

    const serialized = JSON.stringify(toJobChangeEventPayload(event));
    expect(serialized).not.toContain("org_secret");
    expect(serialized).not.toContain("workos");
    expect(serialized).not.toContain("email");
  });

  it("keeps a null project and previous status on create events", () => {
    expect(
      toJobChangeEventPayload({
        ...event,
        type: "job.created",
        projectId: null,
        fromStatus: null,
        assigneeType: null,
      }).data.job,
    ).toMatchObject({
      projectId: null,
      previousStatus: null,
      assigneeType: null,
      status: "succeeded",
    });
  });
});

describe("isJobChangeEventType", () => {
  it("accepts only the recorded job-change types", () => {
    expect(JOB_CHANGE_EVENT_TYPES).toEqual([
      "job.created",
      "job.status_changed",
      "job.assignee_changed",
    ]);
    expect(isJobChangeEventType("job.assignee_changed")).toBe(true);
    expect(isJobChangeEventType("webhook.test")).toBe(false);
    expect(isJobChangeEventType("job.deleted")).toBe(false);
  });
});
