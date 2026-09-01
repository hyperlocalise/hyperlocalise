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
  createJobBodySchema,
  isWithinOverviewTriageLookback,
  openJobStatusValues,
  overviewTriageLookbackCutoff,
  overviewTriageLookbackDays,
  updateJobBodySchema,
} from "./job.schema";

describe("overview triage lookback", () => {
  const now = new Date("2026-08-28T12:00:00.000Z");
  const nowMs = now.getTime();

  it("uses a 7-day window", () => {
    expect(overviewTriageLookbackDays).toBe(7);
    expect(overviewTriageLookbackCutoff(now).toISOString()).toBe("2026-08-21T12:00:00.000Z");
  });

  it("includes jobs updated at the cutoff and excludes older ones", () => {
    expect(isWithinOverviewTriageLookback("2026-08-21T12:00:00.000Z", nowMs)).toBe(true);
    expect(isWithinOverviewTriageLookback("2026-08-21T11:59:59.999Z", nowMs)).toBe(false);
    expect(isWithinOverviewTriageLookback("not-a-date", nowMs)).toBe(false);
  });
});

describe("createJobBodySchema kind and description", () => {
  const fileBase = {
    type: "file" as const,
    fileInput: {
      sourceFileId: "file_abc",
      fileFormat: "json" as const,
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    },
  };

  it("accepts proofread kind and optional description", () => {
    const parsed = createJobBodySchema.safeParse({
      ...fileBase,
      kind: "proofread",
      description: "Keep brand names.",
      title: "Proofread UI",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.kind).toBe("proofread");
      expect(parsed.data.description).toBe("Keep brand names.");
    }
  });

  it("rejects unknown kind and oversized description", () => {
    expect(
      createJobBodySchema.safeParse({
        ...fileBase,
        kind: "review",
      }).success,
    ).toBe(false);
    expect(
      createJobBodySchema.safeParse({
        ...fileBase,
        description: "x".repeat(2_049),
      }).success,
    ).toBe(false);
  });

  it("counts waiting_for_review as an open job status", () => {
    expect(openJobStatusValues).toContain("waiting_for_review");
  });
});

describe("updateJobBodySchema", () => {
  it("requires at least one mutable field", () => {
    expect(updateJobBodySchema.safeParse({}).success).toBe(false);
    expect(updateJobBodySchema.safeParse({ description: null }).success).toBe(true);
    expect(updateJobBodySchema.safeParse({ title: "Retitled" }).success).toBe(true);
  });
});
