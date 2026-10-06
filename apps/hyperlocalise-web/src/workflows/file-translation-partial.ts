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

/** One automatic follow-up job for locales that failed in the parent run. */
export const FILE_TRANSLATION_AUTO_RETRY_LIMIT = 1;

export function parseFileTranslationAutoRetryAttempt(
  metadata?: Record<string, string> | null,
): number {
  const raw = metadata?.autoRetryAttempt?.trim();
  if (!raw) {
    return 0;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function uniqueFileTranslationLocales(locales: string[]): string[] {
  return [...new Set(locales)];
}

export function remainingFileTranslationLocales(input: {
  targetLocales: readonly string[];
  completedLocales: readonly string[];
}): string[] {
  const completed = new Set(input.completedLocales);
  return input.targetLocales.filter((locale) => !completed.has(locale));
}

export function shouldEnqueueFileTranslationFollowUp(input: {
  failedLocales: readonly string[];
  retryAttempt: number;
}): boolean {
  return input.failedLocales.length > 0 && input.retryAttempt < FILE_TRANSLATION_AUTO_RETRY_LIMIT;
}

export function buildFileTranslationFollowUpMetadata(
  metadata: Record<string, string> | undefined,
  input: { parentJobId: string; retryAttempt: number },
): Record<string, string> {
  return {
    ...metadata,
    autoRetryAttempt: String(input.retryAttempt),
    parentJobId: input.parentJobId,
  };
}

export const REUSABLE_FILE_TRANSLATION_FOLLOW_UP_STATUSES = [
  "queued",
  "running",
  "waiting_for_review",
  "succeeded",
] as const;

export function isReusableFileTranslationFollowUpStatus(status: string): boolean {
  return (REUSABLE_FILE_TRANSLATION_FOLLOW_UP_STATUSES as readonly string[]).includes(status);
}
