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
  fillDailySeries,
  formatOverviewLocaleRoute,
  overviewJobKindLabel,
  overviewJobTitle,
  rankOverviewActivity,
  utcDayKey,
  type OverviewActivityItem,
} from "./overview-snapshot-model";

function activity(
  overrides: Partial<OverviewActivityItem> &
    Pick<OverviewActivityItem, "id" | "status" | "updatedAt">,
): OverviewActivityItem {
  return {
    kind: "job",
    title: overrides.id,
    subtitle: "Website",
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
  });

  it("prefers external title, then metadata, then review or sync labels", () => {
    expect(
      overviewJobTitle({
        id: "job_1",
        kind: "translation",
        inputPayload: { metadata: { title: "Home page" } },
        externalTitle: " Crowdin job ",
      }),
    ).toBe("Crowdin job");
    expect(
      overviewJobTitle({
        id: "job_2",
        kind: "review",
        inputPayload: {},
        reviewCriteria: "terminology",
      }),
    ).toBe("Review: terminology");
    expect(
      overviewJobTitle({
        id: "job_3",
        kind: "sync",
        inputPayload: {},
        syncConnectorKind: "github",
        syncDirection: "push",
      }),
    ).toBe("push github");
    expect(
      overviewJobTitle({
        id: "job_4",
        kind: "translation",
        inputPayload: { sourceFileId: "marketing/home.json" },
      }),
    ).toBe("marketing/home.json");
  });

  it("labels translation jobs by type and formats locale routes", () => {
    expect(overviewJobKindLabel({ kind: "translation", type: "file" })).toBe("file");
    expect(overviewJobKindLabel({ kind: "asset_management" })).toBe("asset management");
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
});
