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
import { LOCALISATION_AUDIT_DAILY_RUN_LIMIT, LOCALISATION_AUDIT_RERUN_MS } from "./types";

let dailyRunLimit = LOCALISATION_AUDIT_DAILY_RUN_LIMIT;

export function localisationAuditDailyRunLimit() {
  return dailyRunLimit;
}

/** Test-only: raise the cap so claim tests do not collide with leftover rows. */
export function setLocalisationAuditDailyRunLimitForTests(limit: number) {
  dailyRunLimit = limit;
}

export class LocalisationAuditDailyQuotaExceededError extends Error {
  readonly code = "localisation_audit_daily_quota";

  constructor(limit = localisationAuditDailyRunLimit()) {
    super(`We've reached today's limit of ${limit} audits. Try again tomorrow.`);
    this.name = "LocalisationAuditDailyQuotaExceededError";
  }
}

/**
 * A domain already counted in the rolling window can retry the same-day attempt
 * without taking another slot. A first run or a 24h re-run consumes a slot.
 */
export function localisationAuditRunConsumesDailyQuota(lastAttemptAt: Date | null | undefined) {
  if (lastAttemptAt == null) return true;
  return Date.now() - lastAttemptAt.getTime() >= LOCALISATION_AUDIT_RERUN_MS;
}
