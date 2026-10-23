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
import { toProgressPercent } from "./project-locale-progress";

export type PushTranslationProgressTotals = {
  translatedKeyCount: number;
  approvedKeyCount: number;
  loadedKeyCount: number;
};

export type PushTranslationProgressPercents = {
  translationProgress: number;
  approvalProgress: number;
};

export type PushLocaleProgressRow = PushTranslationProgressPercents & {
  locale: string;
};

export type LoadPushPrefilledEntries = (input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  readyTranslationsOnly?: boolean;
  approvedTranslationsOnly?: boolean;
}) => Promise<{
  translatedKeyCount: number;
  loadedKeyCount: number;
  prefilled: Record<string, string>;
}>;

export type PushLocaleTranslationProgress = PushTranslationProgressTotals & {
  approvedPrefilled: Record<string, string>;
};

export function emptyPushTranslationProgressTotals(): PushTranslationProgressTotals {
  return { translatedKeyCount: 0, approvedKeyCount: 0, loadedKeyCount: 0 };
}

export function addPushTranslationProgressTotals(
  totals: PushTranslationProgressTotals,
  increment: PushTranslationProgressTotals,
) {
  totals.translatedKeyCount += increment.translatedKeyCount;
  totals.approvedKeyCount += increment.approvedKeyCount;
  totals.loadedKeyCount += increment.loadedKeyCount;
}

export function pushTranslationProgressPercents(
  totals: PushTranslationProgressTotals,
): PushTranslationProgressPercents {
  return {
    translationProgress: toProgressPercent(totals.translatedKeyCount, totals.loadedKeyCount),
    approvalProgress: toProgressPercent(totals.approvedKeyCount, totals.loadedKeyCount),
  };
}

export function toPushLocaleProgressRow(
  locale: string,
  totals: PushTranslationProgressTotals,
): PushLocaleProgressRow {
  return {
    locale,
    ...pushTranslationProgressPercents(totals),
  };
}

export async function pushLocaleHasApprovedTranslations(
  load: LoadPushPrefilledEntries,
  input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
  },
): Promise<boolean> {
  const approved = await load({
    ...input,
    approvedTranslationsOnly: true,
    readyTranslationsOnly: true,
  });
  return approved.translatedKeyCount > 0;
}

export async function loadPushLocaleTranslationProgress(
  load: LoadPushPrefilledEntries,
  input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
  },
): Promise<PushLocaleTranslationProgress> {
  const ready = await load({
    ...input,
    readyTranslationsOnly: true,
  });
  if (ready.translatedKeyCount === 0) {
    return {
      translatedKeyCount: 0,
      approvedKeyCount: 0,
      loadedKeyCount: ready.loadedKeyCount,
      approvedPrefilled: {},
    };
  }

  const approved = await load({
    ...input,
    readyTranslationsOnly: true,
    approvedTranslationsOnly: true,
  });
  return {
    translatedKeyCount: ready.translatedKeyCount,
    approvedKeyCount: approved.translatedKeyCount,
    loadedKeyCount: ready.loadedKeyCount,
    approvedPrefilled: approved.prefilled,
  };
}
