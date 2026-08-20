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
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  LocalisationAuditDailyQuotaExceededError,
  localisationAuditDailyRunLimit,
  localisationAuditRunConsumesDailyQuota,
  setLocalisationAuditDailyRunLimitForSourceForTests,
  setLocalisationAuditDailyRunLimitForTests,
} from "./daily-quota";
import { LOCALISATION_AUDIT_DAILY_RUN_LIMIT, LOCALISATION_AUDIT_RERUN_MS } from "./types";

describe("localisationAuditDailyRunLimit", () => {
  afterEach(() => {
    setLocalisationAuditDailyRunLimitForTests(LOCALISATION_AUDIT_DAILY_RUN_LIMIT);
  });

  it("defaults both buckets to the shared daily run limit", () => {
    expect(localisationAuditDailyRunLimit("user")).toBe(LOCALISATION_AUDIT_DAILY_RUN_LIMIT);
    expect(localisationAuditDailyRunLimit("scheduled")).toBe(LOCALISATION_AUDIT_DAILY_RUN_LIMIT);
    expect(LOCALISATION_AUDIT_DAILY_RUN_LIMIT).toBe(20);
  });

  it("allows independent per-source overrides in tests", () => {
    setLocalisationAuditDailyRunLimitForSourceForTests("user", 3);
    setLocalisationAuditDailyRunLimitForSourceForTests("scheduled", 7);
    expect(localisationAuditDailyRunLimit("user")).toBe(3);
    expect(localisationAuditDailyRunLimit("scheduled")).toBe(7);
  });
});

describe("LocalisationAuditDailyQuotaExceededError", () => {
  afterEach(() => {
    setLocalisationAuditDailyRunLimitForTests(LOCALISATION_AUDIT_DAILY_RUN_LIMIT);
  });

  it("names the visitor bucket in the public error message", () => {
    const error = new LocalisationAuditDailyQuotaExceededError("user", 20);
    expect(error.code).toBe("localisation_audit_daily_quota");
    expect(error.runSource).toBe("user");
    expect(error.message).toContain("20 visitor audits");
    expect(error.message).not.toContain("scheduled");
  });

  it("names the scheduled bucket in the internal error message", () => {
    const error = new LocalisationAuditDailyQuotaExceededError("scheduled", 20);
    expect(error.code).toBe("localisation_audit_daily_quota");
    expect(error.runSource).toBe("scheduled");
    expect(error.message).toContain("20 scheduled audits");
    expect(error.message).not.toContain("visitor");
  });

  it("defaults to the user bucket and current user limit", () => {
    setLocalisationAuditDailyRunLimitForSourceForTests("user", 4);
    const error = new LocalisationAuditDailyQuotaExceededError();
    expect(error.runSource).toBe("user");
    expect(error.message).toContain("4 visitor audits");
  });
});

describe("localisationAuditRunConsumesDailyQuota", () => {
  it("treats undefined like a first run", () => {
    expect(localisationAuditRunConsumesDailyQuota(undefined)).toBe(true);
  });

  it("skips the cap for same-day retries inside the re-run window", () => {
    expect(
      localisationAuditRunConsumesDailyQuota(
        new Date(Date.now() - LOCALISATION_AUDIT_RERUN_MS + 60_000),
      ),
    ).toBe(false);
  });
});
