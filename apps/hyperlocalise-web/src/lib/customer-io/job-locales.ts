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

function localeKey(locale: string): string {
  return locale.trim().replace(/_/g, "-").toLowerCase();
}

export function intersectCustomerIoJobLocales(
  remaining: readonly string[],
  configuredTargetLocales: readonly string[] | undefined,
  useProjectTargetLocales: boolean | undefined,
): string[] {
  if (useProjectTargetLocales !== false || !configuredTargetLocales?.length) {
    return [...remaining];
  }
  const allowed = new Set(configuredTargetLocales.map(localeKey));
  return remaining.filter((locale) => allowed.has(localeKey(locale)));
}

export function leftoverCustomerIoJobLocalesNotCoveredByOpenJobs(input: {
  leftoverLocales: readonly string[];
  sourceFileId: string;
  openJobs: ReadonlyArray<{ sourceFileId: string | null; targetLocales: readonly string[] }>;
}): string[] {
  const covered = new Set<string>();
  for (const job of input.openJobs) {
    if (job.sourceFileId !== input.sourceFileId) {
      continue;
    }
    for (const locale of job.targetLocales) {
      covered.add(localeKey(locale));
    }
  }
  return input.leftoverLocales.filter((locale) => !covered.has(localeKey(locale)));
}
