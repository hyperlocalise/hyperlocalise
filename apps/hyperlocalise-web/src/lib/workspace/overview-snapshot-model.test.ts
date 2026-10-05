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
  countOverviewAutomationStatuses,
  dailySeriesDays,
  fillDailySeries,
  formatOverviewLocaleRoute,
  mergeOverviewProjectSources,
  mergeOverviewProjectsWithLive,
  overviewJobKindValue,
  rankOverviewActivity,
  resolveOverviewJobTitle,
  shouldIncludeOverviewAutomations,
  utcDayKey,
  type OverviewActivityItem,
  type OverviewProjectItem,
} from "./overview-snapshot-model";

function activity(
  overrides: Partial<OverviewActivityItem> &
    Pick<OverviewActivityItem, "id" | "status" | "updatedAt">,
): OverviewActivityItem {
  return {
    kind: "job",
    title: { kind: "text", text: overrides.id },
    projectName: "Website",
    jobKind: "translation",
    jobType: "file",
    href: "/jobs/1",
    attention: overrides.status === "failed",
    ...overrides,
  };
}

describe("overview snapshot helpers", () => {
  it("fills a 7-day UTC series with missing days as zero", () => {
    const now = new Date("2026-09-04T18:30:00.000Z");
    const today = utcDayKey(now);
    const twoDaysAgo = utcDayKey(new Date("2026-09-02T08:00:00.000Z"));

    expect(
      fillDailySeries(
        [
          { day: twoDaysAgo, count: 4 },
          { day: today, count: 2 },
        ],
        now,
      ),
    ).toEqual([0, 0, 0, 0, 4, 0, 2]);
    expect(dailySeriesDays(now).map(utcDayKey)).toEqual([
      "2026-08-29",
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });

  it("resolves external title, then metadata, then review or sync fallbacks", () => {
    expect(
      resolveOverviewJobTitle({
        id: "job_1",
        kind: "translation",
        inputPayload: { metadata: { title: "Home page" } },
        externalTitle: " Crowdin job ",
      }),
    ).toEqual({ kind: "text", text: "Crowdin job" });
    expect(
      resolveOverviewJobTitle({
        id: "job_2",
        kind: "review",
        inputPayload: {},
        reviewCriteria: "terminology",
      }),
    ).toEqual({ kind: "review", criteria: "terminology" });
    expect(
      resolveOverviewJobTitle({
        id: "job_3",
        kind: "sync",
        inputPayload: {},
        syncConnectorKind: "github",
        syncDirection: "push",
      }),
    ).toEqual({ kind: "sync", direction: "push", connectorKind: "github" });
    expect(
      resolveOverviewJobTitle({
        id: "job_4",
        kind: "translation",
        inputPayload: { sourceFileId: "marketing/home.json" },
      }),
    ).toEqual({ kind: "text", text: "marketing/home.json" });
    expect(
      resolveOverviewJobTitle({
        id: "job_5",
        kind: "translation",
        inputPayload: { sourceFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a" },
        sourceFilename: "brief.docx",
      }),
    ).toEqual({ kind: "text", text: "brief.docx" });
  });

  it("keeps job kind and translation type structured for the client", () => {
    expect(overviewJobKindValue({ kind: "translation", type: "file" })).toEqual({
      jobKind: "translation",
      jobType: "file",
    });
    expect(overviewJobKindValue({ kind: "asset_management" })).toEqual({
      jobKind: "asset_management",
      jobType: null,
    });
    expect(formatOverviewLocaleRoute("en-US", ["fr-FR", "de-DE", "ja-JP"])).toBe(
      "en-US → fr-FR, de-DE +1",
    );
    expect(formatOverviewLocaleRoute(null, [])).toBe("—");
  });

  it("ranks failed activity first, then newest updates, and keeps four rows", () => {
    const ranked = rankOverviewActivity([
      activity({ id: "ok-old", status: "succeeded", updatedAt: "2026-09-04T12:00:00.000Z" }),
      activity({ id: "fail-old", status: "failed", updatedAt: "2026-09-01T12:00:00.000Z" }),
      activity({ id: "fail-new", status: "failed", updatedAt: "2026-09-04T10:00:00.000Z" }),
      activity({ id: "ok-new", status: "running", updatedAt: "2026-09-04T18:00:00.000Z" }),
      activity({ id: "ok-mid", status: "succeeded", updatedAt: "2026-09-03T12:00:00.000Z" }),
    ]);

    expect(ranked.map((item) => item.id)).toEqual(["fail-new", "fail-old", "ok-new", "ok-old"]);
  });

  it("gates automation data on both operator role and the feature flag", () => {
    expect(
      shouldIncludeOverviewAutomations({ isWorkspaceOperator: true, automationsEnabled: true }),
    ).toBe(true);
    expect(
      shouldIncludeOverviewAutomations({ isWorkspaceOperator: false, automationsEnabled: true }),
    ).toBe(false);
    expect(
      shouldIncludeOverviewAutomations({ isWorkspaceOperator: true, automationsEnabled: false }),
    ).toBe(false);
  });

  it("counts active and paused automations without archived rows", () => {
    expect(
      countOverviewAutomationStatuses([
        { status: "active", count: 12 },
        { status: "paused", count: 3 },
        { status: "archived", count: 50 },
      ]),
    ).toEqual({ total: 15, paused: 3 });
  });

  it("merges live TMS projects ahead of materialized and native rows", () => {
    const merged = mergeOverviewProjectSources({
      live: [{ id: "ext:crowdin:100" }, { id: "ext:crowdin:200" }],
      materialized: [{ id: "ext:crowdin:100" }, { id: "ext:crowdin:300" }],
      native: [{ id: "project_native" }, { id: "ext:crowdin:200" }],
    });

    expect(merged.map((project) => project.id)).toEqual([
      "ext:crowdin:100",
      "ext:crowdin:200",
      "ext:crowdin:300",
      "project_native",
    ]);
  });

  it("prefers live TMS projects and keeps stored extras for matching ids", () => {
    const stored: OverviewProjectItem[] = [
      {
        id: "ext:crowdin:100",
        name: "Materialized",
        source: "external_tms",
        providerKind: "crowdin",
        domain: "docs.example",
        localeRoute: "en → fr-FR",
        latestJobTitle: { kind: "text", text: "Latest" },
        latestJobAt: "2026-03-18T12:15:00.000Z",
        openCount: 2,
        failedCount: 1,
        href: "/org/acme/projects/ext%3Acrowdin%3A100",
      },
      {
        id: "project_native",
        name: "Native",
        source: "native",
        providerKind: null,
        domain: null,
        localeRoute: "en",
        latestJobTitle: null,
        latestJobAt: null,
        openCount: 0,
        failedCount: 0,
        href: "/org/acme/projects/project_native",
      },
    ];

    const merged = mergeOverviewProjectsWithLive({
      organizationSlug: "acme",
      stored,
      live: [
        {
          id: "ext:crowdin:100",
          name: "Live docs",
          externalProviderKind: "crowdin",
          sourceLocale: "en",
          targetLocales: ["fr-FR"],
        },
        {
          id: "ext:crowdin:200",
          name: "Live only",
          externalProviderKind: "crowdin",
          sourceLocale: "en",
          targetLocales: ["de-DE"],
        },
      ],
    });

    expect(merged.map((project) => project.id)).toEqual(["ext:crowdin:100", "ext:crowdin:200"]);
    expect(merged[0]).toMatchObject({
      name: "Live docs",
      domain: "docs.example",
      openCount: 2,
      failedCount: 1,
    });
  });

  it("keeps extras for live projects that are not the newest stored rows", () => {
    const extrasFor = (id: string, name: string): OverviewProjectItem => ({
      id,
      name,
      source: "external_tms",
      providerKind: "crowdin",
      domain: `${id}.example`,
      localeRoute: "en → fr-FR",
      latestJobTitle: { kind: "text", text: `${name} job` },
      latestJobAt: "2026-03-18T12:15:00.000Z",
      openCount: 4,
      failedCount: 2,
      href: `/org/acme/projects/${encodeURIComponent(id)}`,
    });

    const merged = mergeOverviewProjectsWithLive({
      organizationSlug: "acme",
      stored: [
        extrasFor("ext:crowdin:newest", "Newest"),
        extrasFor("ext:crowdin:older", "Older"),
        extrasFor("ext:crowdin:oldest", "Oldest"),
      ],
      live: [
        {
          id: "ext:crowdin:oldest",
          name: "Live oldest",
          sourceLocale: "en",
          targetLocales: ["fr-FR"],
        },
        {
          id: "ext:crowdin:older",
          name: "Live older",
          sourceLocale: "en",
          targetLocales: ["de-DE"],
        },
      ],
    });

    expect(merged.map((project) => project.id)).toEqual([
      "ext:crowdin:oldest",
      "ext:crowdin:older",
    ]);
    expect(merged[0]).toMatchObject({
      name: "Live oldest",
      domain: "ext:crowdin:oldest.example",
      openCount: 4,
      failedCount: 2,
    });
    expect(merged[1]).toMatchObject({
      name: "Live older",
      domain: "ext:crowdin:older.example",
      failedCount: 2,
    });
  });
});
