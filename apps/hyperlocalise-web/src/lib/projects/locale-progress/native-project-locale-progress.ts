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
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { countSourceWords } from "@/lib/reporting/word-analysis";

import { buildLocaleProgressRow, type ProjectLocaleProgressRow } from "./project-locale-progress";

function whitespaceWordCount(sourceText: string) {
  const trimmed = sourceText.trim();
  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

export function countNativeSourceWords(sourceText: string, sourceLocale: string) {
  const trimmed = sourceText.trim();
  if (!trimmed) {
    return 0;
  }

  return countSourceWords(trimmed, sourceLocale) ?? whitespaceWordCount(trimmed);
}

function toIsoTimestamp(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type NativeLocaleStats = {
  translatedPhrases: number;
  approvedPhrases: number;
  translatedWords: number;
  approvedWords: number;
  lastActivityAt: Date | string | null;
};

export async function listNativeProjectLocaleProgress(input: {
  organizationId: string;
  projectId: string;
  sourceLocale?: string | null;
  targetLocales: readonly string[];
}): Promise<ProjectLocaleProgressRow[]> {
  const sourceLocale = input.sourceLocale?.trim() || "en";

  const [keys, translations] = await Promise.all([
    db
      .select({
        id: schema.projectTranslationKeys.id,
        sourceText: schema.projectTranslationKeys.sourceText,
      })
      .from(schema.projectTranslationKeys)
      .where(
        and(
          eq(schema.projectTranslationKeys.organizationId, input.organizationId),
          eq(schema.projectTranslationKeys.projectId, input.projectId),
          eq(schema.projectTranslationKeys.isHidden, false),
        ),
      ),
    db
      .select({
        translationKeyId: schema.projectTranslations.translationKeyId,
        targetLocale: schema.projectTranslations.targetLocale,
        text: schema.projectTranslations.text,
        status: schema.projectTranslations.status,
        updatedAt: schema.projectTranslations.updatedAt,
      })
      .from(schema.projectTranslations)
      .innerJoin(
        schema.projectTranslationKeys,
        eq(schema.projectTranslations.translationKeyId, schema.projectTranslationKeys.id),
      )
      .where(
        and(
          eq(schema.projectTranslations.organizationId, input.organizationId),
          eq(schema.projectTranslations.projectId, input.projectId),
          eq(schema.projectTranslationKeys.isHidden, false),
        ),
      ),
  ]);

  const wordCountByKeyId = new Map(
    keys.map((key) => [key.id, countNativeSourceWords(key.sourceText, sourceLocale)] as const),
  );
  const phraseTotal = keys.length;
  const wordTotal = [...wordCountByKeyId.values()].reduce((sum, count) => sum + count, 0);

  const statsByLocale = new Map<string, NativeLocaleStats>();
  for (const translation of translations) {
    const wordCount = wordCountByKeyId.get(translation.translationKeyId) ?? 0;
    const current = statsByLocale.get(translation.targetLocale) ?? {
      translatedPhrases: 0,
      approvedPhrases: 0,
      translatedWords: 0,
      approvedWords: 0,
      lastActivityAt: null,
    };
    const hasText = translation.text.trim() !== "";
    if (hasText) {
      current.translatedPhrases += 1;
      current.translatedWords += wordCount;
    }
    if (translation.status === "approved") {
      current.approvedPhrases += 1;
      current.approvedWords += wordCount;
    }
    if (
      !current.lastActivityAt ||
      new Date(translation.updatedAt).getTime() > new Date(current.lastActivityAt).getTime()
    ) {
      current.lastActivityAt = translation.updatedAt;
    }
    statsByLocale.set(translation.targetLocale, current);
  }

  const seen = new Set<string>();
  const rows: ProjectLocaleProgressRow[] = [];

  for (const locale of input.targetLocales) {
    seen.add(locale);
    const stats = statsByLocale.get(locale);
    rows.push(
      buildLocaleProgressRow({
        locale,
        words: {
          total: wordTotal,
          translated: stats?.translatedWords ?? 0,
          approved: stats?.approvedWords ?? 0,
        },
        phrases: {
          total: phraseTotal,
          translated: stats?.translatedPhrases ?? 0,
          approved: stats?.approvedPhrases ?? 0,
        },
        lastActivityAt: toIsoTimestamp(stats?.lastActivityAt),
      }),
    );
  }

  for (const [locale, stats] of statsByLocale) {
    if (seen.has(locale)) {
      continue;
    }

    rows.push(
      buildLocaleProgressRow({
        locale,
        words: {
          total: wordTotal,
          translated: stats.translatedWords,
          approved: stats.approvedWords,
        },
        phrases: {
          total: phraseTotal,
          translated: stats.translatedPhrases,
          approved: stats.approvedPhrases,
        },
        lastActivityAt: toIsoTimestamp(stats.lastActivityAt),
      }),
    );
  }

  if (input.targetLocales.length === 0 && rows.length === 0 && phraseTotal === 0) {
    return [];
  }

  return rows;
}
