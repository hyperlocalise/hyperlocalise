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

import { createQaReport } from "@/components/qa/qa.fixture";

import { qaTrendReports } from "./qa-project-trend";

function succeeded(id: string, day: string) {
  return createQaReport({
    id,
    projectId: "project_website",
    status: "succeeded",
    createdAt: `${day}T08:00:00.000Z`,
    completedAt: `${day}T08:04:00.000Z`,
  });
}

describe("qaTrendReports", () => {
  it("keeps the ten most recent successful scans in chronological order", () => {
    const reports = Array.from({ length: 12 }, (_, index) =>
      succeeded(`run_${index}`, `2026-09-${String(30 - index).padStart(2, "0")}`),
    );

    expect(qaTrendReports(reports, "run_0").map((row) => row.id)).toEqual([
      "run_9",
      "run_8",
      "run_7",
      "run_6",
      "run_5",
      "run_4",
      "run_3",
      "run_2",
      "run_1",
      "run_0",
    ]);
  });

  it("slides a contiguous window so an older selected scan stays next to its neighbors", () => {
    const reports = Array.from({ length: 12 }, (_, index) =>
      succeeded(`run_${index}`, `2026-09-${String(30 - index).padStart(2, "0")}`),
    );

    expect(qaTrendReports(reports, "run_11").map((row) => row.id)).toEqual([
      "run_11",
      "run_10",
      "run_9",
      "run_8",
      "run_7",
      "run_6",
      "run_5",
      "run_4",
      "run_3",
      "run_2",
    ]);
  });
});
