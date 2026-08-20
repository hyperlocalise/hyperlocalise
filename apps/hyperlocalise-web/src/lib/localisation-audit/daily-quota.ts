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
import { getIntlShape } from "@/lib/app-i18n/intl";

import {
  LOCALISATION_AUDIT_DAILY_RUN_LIMIT,
  LOCALISATION_AUDIT_RERUN_MS,
  type LocalisationAuditRunSource,
} from "./types";

const DEFAULT_LIMITS: Record<LocalisationAuditRunSource, number> = {
  user: LOCALISATION_AUDIT_DAILY_RUN_LIMIT,
  scheduled: LOCALISATION_AUDIT_DAILY_RUN_LIMIT,
};

let dailyRunLimits: Record<LocalisationAuditRunSource, number> = { ...DEFAULT_LIMITS };

export function localisationAuditDailyRunLimit(runSource: LocalisationAuditRunSource = "user") {
  return dailyRunLimits[runSource];
}

/** Test-only: set both buckets so claim tests do not collide with leftover rows. */
export function setLocalisationAuditDailyRunLimitForTests(limit: number) {
  dailyRunLimits = { user: limit, scheduled: limit };
}

/** Test-only: set one bucket without changing the other. */
export function setLocalisationAuditDailyRunLimitForSourceForTests(
  runSource: LocalisationAuditRunSource,
  limit: number,
) {
  dailyRunLimits = { ...dailyRunLimits, [runSource]: limit };
}

export class LocalisationAuditDailyQuotaExceededError extends Error {
  readonly code = "localisation_audit_daily_quota";
  readonly runSource: LocalisationAuditRunSource;

  constructor(
    runSource: LocalisationAuditRunSource = "user",
    limit = localisationAuditDailyRunLimit(runSource),
  ) {
    const intl = getIntlShape();
    const message =
      runSource === "scheduled"
        ? intl.formatMessage(
            {
              defaultMessage:
                "We've reached today's limit of {limit} scheduled audits. Try again tomorrow.",
              id: "RYfCDsRyCY",
              description: "Error when the scheduled localisation audit daily quota is exhausted",
            },
            { limit },
          )
        : intl.formatMessage(
            {
              defaultMessage:
                "We've reached today's limit of {limit} visitor audits. Try again tomorrow.",
              id: "nCmj3mv2tP",
              description: "Error when the public localisation audit daily quota is exhausted",
            },
            { limit },
          );
    super(message);
    this.name = "LocalisationAuditDailyQuotaExceededError";
    this.runSource = runSource;
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
