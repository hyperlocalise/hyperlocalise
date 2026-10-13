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

import { buildJobActivity, type JobActivityRun } from "./build-job-activity";
import {
  failedThenRetriedJobEvents,
  inProgressJobEvents,
  jobEventsFixture,
  partialFailureJobEvents,
} from "./job-activity.fixture";

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
