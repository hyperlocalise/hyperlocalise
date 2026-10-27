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
  applyReportsChange,
  buildReportsHref,
  DEFAULT_REPORTS_STATE,
  parseReportsSearchParams,
  presetDates,
} from "./reports-url-state";

describe("Reports URL state", () => {
  it("keeps defaults out of the URL", () => {
    expect(buildReportsHref("/org/acme/reports", DEFAULT_REPORTS_STATE)).toBe("/org/acme/reports");
  });

  it("round-trips every filter", () => {
    const state = {
      ...DEFAULT_REPORTS_STATE,
      tab: "estimate" as const,
      range: "custom" as const,
      from: "2026-07-01",
      to: "2026-07-31",
      projectId: "project_1",
      jobIds: ["job_a", "job_b"],
      targetLocale: "ja-JP",
      step: "review" as const,
      unit: "characters" as const,
      mode: "finished" as const,
      groupBy: "task" as const,
      page: 3,
      rateCard: "Standard 2026",
      aiGroup: "model" as const,
      aiThen: "task" as const,
      aiMeasure: "charge" as const,
      aiFilters: { area: "translation", key: "own_key", automation: "auto_1" },
    };
    const href = buildReportsHref("/org/acme/reports", state);
    expect(href).toBe(
      "/org/acme/reports?tab=estimate&range=custom&from=2026-07-01&to=2026-07-31&project=project_1&tasks=job_a%2Cjob_b&language=ja-JP&step=review&unit=characters&mode=finished&group=task&page=3&card=Standard+2026&ai=model&ai2=task&measure=charge&area=translation&key=own_key&automation=auto_1",
    );
    expect(parseReportsSearchParams(new URLSearchParams(href.split("?")[1]))).toEqual(state);
  });

  it("ignores values it does not know", () => {
    expect(
      parseReportsSearchParams(
        new URLSearchParams(
          "tab=secret&range=365&from=yesterday&unit=pages&page=-2&step=qa&ai=origin&area=all&key=mine&measure=money",
        ),
      ),
    ).toEqual(DEFAULT_REPORTS_STATE);
  });

  it("never groups AI usage by the same detail twice", () => {
    expect(parseReportsSearchParams(new URLSearchParams("ai=model&ai2=model"))).toMatchObject({
      aiGroup: "model",
      aiThen: null,
    });
  });

  it("drops custom dates from a preset range and goes back to the first page on a change", () => {
    const custom = {
      ...DEFAULT_REPORTS_STATE,
      range: "custom" as const,
      from: "2026-07-01",
      to: "2026-07-31",
      page: 4,
    };
    expect(applyReportsChange(custom, { range: "7" })).toMatchObject({
      range: "7",
      from: null,
      to: null,
      page: 1,
    });
    expect(applyReportsChange(custom, { page: 5 }).page).toBe(5);
  });

  it("works out each ready-made range from today, in UTC calendar months", () => {
    expect(presetDates("7", "2026-10-21", null)).toEqual({ from: "2026-10-15", to: "2026-10-21" });
    expect(presetDates("month", "2026-10-21", null)).toEqual({
      from: "2026-10-01",
      to: "2026-10-21",
    });
    // Last month from January is December of the year before.
    expect(presetDates("last_month", "2026-01-09", null)).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(presetDates("quarter", "2026-11-03", null)).toEqual({
      from: "2026-10-01",
      to: "2026-11-03",
    });
    expect(presetDates("all", "2026-10-21", "2026-03-03")).toEqual({
      from: "2026-03-03",
      to: "2026-10-21",
    });
    // Before Reports has started, "since Reports started" is today.
    expect(presetDates("all", "2026-10-21", null)).toEqual({
      from: "2026-10-21",
      to: "2026-10-21",
    });
    expect(parseReportsSearchParams(new URLSearchParams("range=last_month")).range).toBe(
      "last_month",
    );
  });
});
