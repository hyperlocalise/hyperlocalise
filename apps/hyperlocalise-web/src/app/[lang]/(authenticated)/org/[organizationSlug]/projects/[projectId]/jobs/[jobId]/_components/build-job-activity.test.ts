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
  buildJobActivity,
  hasTerminalJobEvent,
  JOB_TERMINAL_EVENT_POLL_GRACE_MS,
  latestWorkflowRunId,
  shouldPollJobEvents,
  type JobActivityRun,
} from "./build-job-activity";
import {
  failedThenRetriedJobEvents,
  inProgressJobEvents,
  jobEventsFixture,
  partialFailureJobEvents,
} from "./job-activity.fixture";

const succeededTerminalEvent = partialFailureJobEvents.find(
  (event) => event.type === "job_succeeded",
);
const failedTerminalEvent = failedThenRetriedJobEvents.find((event) => event.type === "job_failed");

function onlyRun(items: ReturnType<typeof buildJobActivity>): JobActivityRun {
  expect(items).toHaveLength(1);
  const [run] = items;
  if (run?.kind !== "run") throw new Error("expected a run");
  return run;
}

describe("buildJobActivity", () => {
  it("returns nothing for jobs without events", () => {
    expect(buildJobActivity([], { jobStatus: "queued" })).toEqual([]);
  });

  it("tracks per-locale progress for a running job", () => {
    const run = onlyRun(buildJobActivity(inProgressJobEvents, { jobStatus: "running" }));

    expect(run).toMatchObject({
      stage: "translating",
      stringCount: 340,
      glossaryTermCount: 12,
      endedAt: null,
    });
    expect(run.locales).toEqual([
      {
        locale: "fr-FR",
        status: "translating",
        translatedCount: 220,
        totalCount: 340,
        reusedCount: 80,
      },
      {
        locale: "de-DE",
        status: "translating",
        translatedCount: 120,
        totalCount: 340,
        reusedCount: null,
      },
      {
        locale: "ja-JP",
        status: "translating",
        translatedCount: 40,
        totalCount: 340,
        reusedCount: null,
      },
    ]);
    expect(run.steps).toHaveLength(inProgressJobEvents.length);
  });

  it("stays in preparation until translation starts", () => {
    const run = onlyRun(
      buildJobActivity(inProgressJobEvents.slice(0, 3), { jobStatus: "running" }),
    );

    expect(run.stage).toBe("preparing");
    expect(run.locales.map((locale) => locale.status)).toEqual(["pending", "pending", "pending"]);
  });

  it("records completed and failed locales with a follow-up job", () => {
    const run = onlyRun(buildJobActivity(partialFailureJobEvents, { jobStatus: "succeeded" }));

    expect(run.stage).toBe("succeeded");
    expect(run.endedAt).toBe(partialFailureJobEvents.at(-1)?.createdAt);
    expect(run.followUpJobId).toBe("job_follow_up");
    expect(
      run.locales.map(({ locale, status, translatedCount }) => [locale, status, translatedCount]),
    ).toEqual([
      ["fr-FR", "completed", 340],
      ["de-DE", "completed", 340],
      ["ja-JP", "failed", null],
    ]);
  });

  it("splits retries into separate runs around the user action", () => {
    const items = buildJobActivity(failedThenRetriedJobEvents, { jobStatus: "running" });

    expect(items.map((item) => item.kind)).toEqual(["run", "action", "run"]);
    expect(items[0]).toMatchObject({
      id: "run-1",
      stage: "failed",
      failureCode: "file_translation_failed",
      locales: [{ locale: "fr-FR", status: "failed" }],
    });
    expect(items[1]).toMatchObject({ type: "job_retried", actorUserId: "user-1" });
    expect(items[2]).toMatchObject({ id: "run-2", stage: "preparing", stringCount: 42 });
  });

  it("marks unfinished runs as stopped once the job is cancelled", () => {
    const events = jobEventsFixture([
      { type: "job_started", payload: { targetLocales: ["fr-FR"] } },
      { type: "job_cancelled", workflowRunId: null, actorUserId: "user-1", payload: {} },
    ]);

    const [run, action] = buildJobActivity(events, { jobStatus: "cancelled" });
    expect(run).toMatchObject({ kind: "run", stage: "stopped" });
    expect(action).toMatchObject({ kind: "action", type: "job_cancelled" });
  });

  it("falls back to the job status when the terminal event is missing", () => {
    const run = onlyRun(buildJobActivity(inProgressJobEvents, { jobStatus: "succeeded" }));

    expect(run.stage).toBe("succeeded");
  });

  it("ignores repeated completion events", () => {
    const events = jobEventsFixture([
      {
        type: "locale_progress",
        locale: "fr-FR",
        payload: { translatedCount: 10, totalCount: 10 },
      },
      { type: "locale_completed", locale: "fr-FR", payload: { fileId: "file-1" } },
      { type: "locale_completed", locale: "fr-FR", payload: { fileId: "file-1" } },
      {
        type: "locale_progress",
        locale: "fr-FR",
        payload: { translatedCount: 10, totalCount: 10 },
      },
    ]);

    const run = onlyRun(buildJobActivity(events, { jobStatus: "running" }));
    expect(run.locales).toEqual([
      {
        locale: "fr-FR",
        status: "completed",
        translatedCount: 10,
        totalCount: 10,
        reusedCount: null,
      },
    ]);
  });
});

describe("shouldPollJobEvents", () => {
  it("polls while the job is active", () => {
    expect(shouldPollJobEvents("running", [])).toBe(true);
    expect(shouldPollJobEvents("queued", undefined)).toBe(true);
  });

  it("keeps polling after terminal status until a terminal event arrives", () => {
    expect(shouldPollJobEvents("succeeded", [])).toBe(true);
    expect(shouldPollJobEvents("failed", [])).toBe(true);
    expect(shouldPollJobEvents("succeeded", [succeededTerminalEvent!])).toBe(false);
    expect(shouldPollJobEvents("failed", [failedTerminalEvent!])).toBe(false);
  });

  it("keeps polling after retry until the latest run has a terminal event", () => {
    expect(shouldPollJobEvents("succeeded", failedThenRetriedJobEvents)).toBe(true);
    expect(shouldPollJobEvents("failed", failedThenRetriedJobEvents)).toBe(true);
    expect(
      shouldPollJobEvents("succeeded", failedThenRetriedJobEvents, { workflowRunId: "run-2" }),
    ).toBe(true);

    const latestSucceeded = jobEventsFixture([
      { type: "job_started", payload: { targetLocales: ["fr-FR"] } },
      {
        type: "job_failed",
        payload: { code: "file_translation_failed", failedLocales: ["fr-FR"], followUpJobId: null },
      },
      { type: "job_retried", workflowRunId: null, actorUserId: "user-1", payload: {} },
      { type: "job_started", workflowRunId: "run-2", payload: { targetLocales: ["fr-FR"] } },
      {
        type: "job_succeeded",
        workflowRunId: "run-2",
        payload: { completedLocales: ["fr-FR"], failedLocales: [], followUpJobId: "job_follow_up" },
      },
    ]);
    expect(shouldPollJobEvents("succeeded", latestSucceeded)).toBe(false);
    expect(shouldPollJobEvents("succeeded", latestSucceeded, { workflowRunId: "run-2" })).toBe(
      false,
    );
  });

  it("stops polling for cancelled jobs and after the grace window", () => {
    expect(shouldPollJobEvents("cancelled", [])).toBe(false);
    expect(
      shouldPollJobEvents("succeeded", [], {
        waitingForTerminalEventMs: JOB_TERMINAL_EVENT_POLL_GRACE_MS,
      }),
    ).toBe(false);
  });

  it("detects a terminal event only for the latest workflow run", () => {
    expect(hasTerminalJobEvent([])).toBe(false);
    expect(hasTerminalJobEvent(succeededTerminalEvent ? [succeededTerminalEvent] : [])).toBe(true);
    expect(hasTerminalJobEvent(failedTerminalEvent ? [failedTerminalEvent] : [])).toBe(true);
    expect(latestWorkflowRunId(failedThenRetriedJobEvents)).toBe("run-2");
    expect(hasTerminalJobEvent(failedThenRetriedJobEvents)).toBe(false);
    expect(hasTerminalJobEvent(failedThenRetriedJobEvents, "run-1")).toBe(true);
    expect(hasTerminalJobEvent(failedThenRetriedJobEvents, "run-2")).toBe(false);
    expect(hasTerminalJobEvent(failedThenRetriedJobEvents.slice(0, 4))).toBe(false);
  });
});
