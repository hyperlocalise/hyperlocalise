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
  isKanbanStatus,
  readJobsViewMode,
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
