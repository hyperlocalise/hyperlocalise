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
  buildJobDetailHref,
  getDueUrgency,
  isKanbanStatus,
  jobDueDate,
  readJobsViewMode,
  sortBoardJobs,
  writeJobsViewMode,
} from "./jobs-view-helpers";

describe("jobs-view-helpers", () => {
  it("builds project job detail hrefs", () => {
    expect(buildJobDetailHref("acme", "project-1", "job-1")).toBe(
      "/org/acme/projects/project-1/jobs/job-1",
    );
    expect(buildJobDetailHref("acme", null, "job-1")).toBeNull();
    expect(buildJobDetailHref("acme", null, "ext:crowdin:project-1:job-1")).toBe(
      "/org/acme/projects/ext%3Acrowdin%3Aproject-1/jobs/ext%3Acrowdin%3Aproject-1%3Ajob-1",
    );
  });

  it("identifies known kanban statuses", () => {
    expect(isKanbanStatus("running")).toBe(true);
    expect(isKanbanStatus("unknown_status")).toBe(false);
  });

  it("persists project jobs view mode in local storage", () => {
    const storage = new Map<string, string>();
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });

    try {
      expect(readJobsViewMode()).toBe("kanban");
      writeJobsViewMode("row");
      expect(readJobsViewMode()).toBe("row");
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  it("defaults to kanban and skips writes when storage is unavailable", () => {
    expect(readJobsViewMode()).toBe("kanban");
    expect(() => writeJobsViewMode("row")).not.toThrow();
    expect(readJobsViewMode()).toBe("kanban");
  });
});

describe("jobDueDate", () => {
  it("prefers the provider due date, then the native dueAt", () => {
    expect(
      jobDueDate({
        externalDueDate: "2026-05-01T00:00:00.000Z",
        dueAt: "2026-06-01T00:00:00.000Z",
      }),
    ).toBe("2026-05-01T00:00:00.000Z");
    expect(
      jobDueDate({
        externalDueDate: null,
        dueAt: "2026-06-01T00:00:00.000Z",
      }),
    ).toBe("2026-06-01T00:00:00.000Z");
    expect(jobDueDate({ externalDueDate: null })).toBeNull();
  });
});

describe("sortBoardJobs", () => {
  const job = (
    id: string,
    overrides: {
      due?: string | null;
      dueAt?: string | null;
      updatedAt?: string;
      completedAt?: string | null;
    },
  ) => ({
    id,
    externalDueDate: overrides.due ?? null,
    dueAt: overrides.dueAt,
    updatedAt: overrides.updatedAt ?? "2026-06-01T00:00:00.000Z",
    completedAt: overrides.completedAt ?? null,
  });

  it("orders open work by soonest due date, undated jobs last", () => {
    const jobs = [
      job("undated", {}),
      job("later", { due: "2026-06-10T00:00:00.000Z" }),
      job("sooner", { due: "2026-06-03T00:00:00.000Z" }),
    ];

    expect(sortBoardJobs("running", jobs).map((item) => item.id)).toEqual([
      "sooner",
      "later",
      "undated",
    ]);
  });

  it("orders open work by native dueAt when no provider date exists", () => {
    const jobs = [
      job("undated", {}),
      job("later", { dueAt: "2026-06-10T00:00:00.000Z" }),
      job("sooner", { dueAt: "2026-06-03T00:00:00.000Z" }),
      job("provider", {
        due: "2026-06-01T00:00:00.000Z",
        dueAt: "2026-06-20T00:00:00.000Z",
      }),
    ];

    expect(sortBoardJobs("queued", jobs).map((item) => item.id)).toEqual([
      "provider",
      "sooner",
      "later",
      "undated",
    ]);
  });

  it("orders closed and failed work by most recent activity", () => {
    const jobs = [
      job("old", { updatedAt: "2026-06-01T00:00:00.000Z" }),
      job("completed", {
        updatedAt: "2026-06-01T00:00:00.000Z",
        completedAt: "2026-06-05T00:00:00.000Z",
      }),
      job("recent", { updatedAt: "2026-06-04T00:00:00.000Z" }),
    ];

    expect(sortBoardJobs("succeeded", jobs).map((item) => item.id)).toEqual([
      "completed",
      "recent",
      "old",
    ]);
    expect(sortBoardJobs("failed", jobs).map((item) => item.id)).toEqual([
      "completed",
      "recent",
      "old",
    ]);
  });

  it("does not mutate the input", () => {
    const jobs = [job("b", { due: "2026-06-10T00:00:00.000Z" }), job("a", { due: null })];
    sortBoardJobs("queued", jobs);
    expect(jobs.map((item) => item.id)).toEqual(["b", "a"]);
  });
});

describe("getDueUrgency", () => {
  const now = Date.UTC(2026, 5, 6, 12, 0, 0);

  it("classifies due dates relative to now", () => {
    expect(getDueUrgency(null, now)).toBeNull();
    expect(getDueUrgency("not a date", now)).toBeNull();
    expect(getDueUrgency(new Date(now - 60_000).toISOString(), now)).toBe("overdue");
    expect(getDueUrgency(new Date(now + 3_600_000).toISOString(), now)).toBe("soon");
    expect(getDueUrgency(new Date(now + 3 * 86_400_000).toISOString(), now)).toBe("upcoming");
  });
});
