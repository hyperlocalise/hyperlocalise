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

export type JobFailureDetails = {
  reason: string | null;
  failedLocales: string[];
  followUpJobId: string | null;
  code: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value.filter((item): item is string => typeof item === "string" && item.trim().length > 0),
    ),
  ];
}

export function readJobFailureDetails(job: {
  lastError?: string | null;
  outcomePayload?: unknown;
}): JobFailureDetails {
  const payload = asRecord(job.outcomePayload);
  return {
    reason: asNonEmptyString(job.lastError) ?? asNonEmptyString(payload?.message),
    failedLocales: asStringList(payload?.failedLocales),
    followUpJobId: asNonEmptyString(payload?.followUpJobId),
    code: asNonEmptyString(payload?.code),
  };
}

export function isAgentAssignedJob(job: { assigneeType?: string | null }): boolean {
  return job.assigneeType === "agent";
}

export function hasJobFailureDetails(details: JobFailureDetails): boolean {
  return Boolean(details.reason || details.failedLocales.length > 0 || details.followUpJobId);
}

export function shouldShowJobFailureDetails(
  job: { assigneeType?: string | null },
  details: JobFailureDetails,
): boolean {
  return isAgentAssignedJob(job) && hasJobFailureDetails(details);
}

export function formatJobFailureReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function formatJobFailureMessage(reason: string, failedLocales: readonly string[]): string {
  if (failedLocales.length === 0) {
    return reason;
  }
  return `${reason} Failed locales: ${failedLocales.join(", ")}.`;
}
