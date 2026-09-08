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
import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

import { buildLocaleProgressRow, type ProjectLocaleProgressRow } from "./project-locale-progress";

const sourceWordCountSql = sql<number>`case
  when btrim(${schema.projectTranslationKeys.sourceText}) = '' then 0
  else coalesce(cardinality(regexp_split_to_array(btrim(${schema.projectTranslationKeys.sourceText}), E'\\s+')), 0)
end`;

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

export async function listNativeProjectLocaleProgress(input: {
  organizationId: string;
  projectId: string;
  targetLocales: readonly string[];
}): Promise<ProjectLocaleProgressRow[]> {
  const [totals] = await db
    .select({
      phraseTotal: sql<number>`count(*)::int`.mapWith(Number),
      wordTotal: sql<number>`coalesce(sum(${sourceWordCountSql}), 0)::int`.mapWith(Number),
    })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, input.organizationId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.projectTranslationKeys.isHidden, false),
      ),
    );

  const phraseTotal = totals?.phraseTotal ?? 0;
  const wordTotal = totals?.wordTotal ?? 0;

  const localeStats = await db
    .select({
      targetLocale: schema.projectTranslations.targetLocale,
      translatedPhrases:
        sql<number>`count(*) filter (where btrim(${schema.projectTranslations.text}) <> '')::int`.mapWith(
          Number,
        ),
      approvedPhrases:
        sql<number>`count(*) filter (where ${schema.projectTranslations.status} = 'approved')::int`.mapWith(
          Number,
        ),
      translatedWords:
        sql<number>`coalesce(sum(${sourceWordCountSql}) filter (where btrim(${schema.projectTranslations.text}) <> ''), 0)::int`.mapWith(
          Number,
        ),
      approvedWords:
        sql<number>`coalesce(sum(${sourceWordCountSql}) filter (where ${schema.projectTranslations.status} = 'approved'), 0)::int`.mapWith(
          Number,
        ),
      lastActivityAt: sql<Date | string | null>`max(${schema.projectTranslations.updatedAt})`,
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
    )
    .groupBy(schema.projectTranslations.targetLocale);

  const statsByLocale = new Map(localeStats.map((row) => [row.targetLocale, row] as const));
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
