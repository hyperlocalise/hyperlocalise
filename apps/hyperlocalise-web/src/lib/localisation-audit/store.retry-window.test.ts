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

import { localisationAuditRunConsumesDailyQuota } from "./daily-quota";
import {
  isLocalisationAuditRerunnable,
  isLocalisationAuditRetryable,
  localisationAuditRerunAvailableAt,
  type LocalisationAuditRow,
} from "./store";
import { LOCALISATION_AUDIT_RERUN_MS } from "./types";

function audit(overrides: Partial<LocalisationAuditRow> = {}): LocalisationAuditRow {
  const timestamp = new Date("2026-08-14T00:00:00.000Z");
  return {
    id: "audit-1",
    domainKey: "example.com",
    domainSlug: "example-com",
    sourceUrl: "https://example.com/",
    status: "succeeded",
    attemptNumber: 1,
    progressStage: "completed",
    statusUpdatedAt: timestamp,
    lastAttemptAt: timestamp,
    workflowRunId: null,
    focusLocales: [],
    score: 72,
    teaser: null,
    report: { score: 72 } as LocalisationAuditRow["report"],
    errorCode: null,
    errorMessage: null,
    startedAt: timestamp,
    completedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("localisation audit daily re-run window", () => {
  it("keeps a fresh successful report until 24 hours have passed", () => {
    const row = audit({ completedAt: new Date() });
    expect(isLocalisationAuditRerunnable(row)).toBe(false);
    expect(isLocalisationAuditRetryable(row)).toBe(false);
    const availableAt = localisationAuditRerunAvailableAt(row);
    expect(availableAt?.getTime()).toBe(
      (row.completedAt?.getTime() ?? 0) + LOCALISATION_AUDIT_RERUN_MS,
    );
  });

  it("allows a successful report to be re-run after 24 hours", () => {
    const row = audit({
      completedAt: new Date(Date.now() - LOCALISATION_AUDIT_RERUN_MS - 1_000),
    });
    expect(isLocalisationAuditRerunnable(row)).toBe(true);
    expect(isLocalisationAuditRetryable(row)).toBe(false);
  });

  it("still retries failed audits and incomplete successes immediately", () => {
    expect(isLocalisationAuditRetryable(audit({ status: "failed", report: null }))).toBe(true);
    expect(isLocalisationAuditRetryable(audit({ report: null }))).toBe(true);
    expect(isLocalisationAuditRerunnable(audit({ status: "failed", report: null }))).toBe(false);
    expect(localisationAuditRerunAvailableAt(audit({ status: "failed", report: null }))).toBeNull();
  });

  it("counts first runs and aged re-runs toward the daily cap, not same-day retries", () => {
    expect(localisationAuditRunConsumesDailyQuota(null)).toBe(true);
    expect(localisationAuditRunConsumesDailyQuota(new Date())).toBe(false);
    expect(
      localisationAuditRunConsumesDailyQuota(
        new Date(Date.now() - LOCALISATION_AUDIT_RERUN_MS - 1_000),
      ),
    ).toBe(true);
  });
});
