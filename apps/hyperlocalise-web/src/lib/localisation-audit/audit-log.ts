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

const MAX_ERROR_DETAIL_LENGTH = 500;
const URL_PATTERN = /\b[a-z][a-z\d+.-]*:\/\/[^\s"'<>]+/gi;
const BEARER_PATTERN = /bearer\s+[^\s"',]+/gi;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/** Error name and message with URL paths, query strings, emails and bearer tokens removed. */
export type AuditErrorDetail = {
  name: string;
  message: string;
  causeCode?: string;
};

/**
 * Keeps only the scheme and host of URLs (CDP connect URLs can carry session
 * tokens, page URLs carry customer paths), strips emails and bearer tokens, and
 * caps the length.
 */
export function redactAuditErrorText(text: string): string {
  const redacted = text
    .replace(URL_PATTERN, (match) => {
      try {
        const url = new URL(match);
        return `${url.protocol}//${url.host}/<redacted>`;
      } catch {
        return "<url>";
      }
    })
    .replace(BEARER_PATTERN, "Bearer <redacted>")
    .replace(EMAIL_PATTERN, "<email>")
    .replace(/\s+/g, " ")
    .trim();
  return redacted.length > MAX_ERROR_DETAIL_LENGTH
    ? `${redacted.slice(0, MAX_ERROR_DETAIL_LENGTH)}…`
    : redacted;
}

export function describeAuditError(error: unknown): AuditErrorDetail {
  const name = error instanceof Error ? error.name : typeof error;
  const message = redactAuditErrorText(error instanceof Error ? error.message : String(error));
  const cause =
    error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  return typeof cause?.code === "string"
    ? { name, message, causeCode: cause.code }
    : { name, message };
}

/** Flat log fields for an error, so log search can filter on each one. */
export function auditErrorLogFields(error: unknown) {
  const detail = describeAuditError(error);
  return {
    errorName: detail.name,
    errorMessage: detail.message,
    errorCauseCode: detail.causeCode,
  };
}

/** Counts HTTP statuses by class (`2xx`, `4xx`, ...); `0` means the page never responded. */
export function auditStatusCounts(pages: ReadonlyArray<{ status: number }>) {
  const counts: Record<string, number> = {};
  for (const { status } of pages) {
    const key = status > 0 ? `${Math.floor(status / 100)}xx` : "0";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function auditElapsedMs(startedAt: number) {
  return Math.round(performance.now() - startedAt);
}
