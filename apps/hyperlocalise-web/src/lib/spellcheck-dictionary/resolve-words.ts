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
import { and, asc, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

import { capResolvedSpellcheckWords } from "./normalize-word";

export type ResolvedSpellcheckWords = {
  words: string[];
  wordsVersion: string;
  dictionaryIds: string[];
};

type AttachedWordRow = {
  dictionaryId: string;
  wordsVersion: number;
  priority: number;
  createdAtMs: number;
  word: string;
  wordNormalized: string;
};

function attachmentWinsOver(
  candidate: Pick<AttachedWordRow, "priority" | "createdAtMs" | "dictionaryId">,
  existing: Pick<AttachedWordRow, "priority" | "createdAtMs" | "dictionaryId">,
) {
  if (candidate.priority !== existing.priority) {
    return candidate.priority < existing.priority;
  }
  if (candidate.createdAtMs !== existing.createdAtMs) {
    return candidate.createdAtMs < existing.createdAtMs;
  }
  return candidate.dictionaryId.localeCompare(existing.dictionaryId) < 0;
}

export function unionResolvedSpellcheckWords(rows: readonly AttachedWordRow[]): string[] {
  const firstWins = new Map<
    string,
    { word: string; priority: number; createdAtMs: number; dictionaryId: string }
  >();

  for (const row of rows) {
    const existing = firstWins.get(row.wordNormalized);
    if (!existing || attachmentWinsOver(row, existing)) {
      firstWins.set(row.wordNormalized, {
        word: row.word,
        priority: row.priority,
        createdAtMs: row.createdAtMs,
        dictionaryId: row.dictionaryId,
      });
    }
  }

  return capResolvedSpellcheckWords(
    [...firstWins.values()]
      .toSorted((left, right) => left.word.localeCompare(right.word, "en"))
      .map((entry) => entry.word),
  );
}

export function resolvedSpellcheckWordsVersion(
  attachments: readonly { dictionaryId: string; wordsVersion: number }[],
  locale: string,
): string {
  return attachments
    .toSorted((left, right) => left.dictionaryId.localeCompare(right.dictionaryId))
    .map((attachment) => `${attachment.dictionaryId}:${attachment.wordsVersion}`)
    .concat(locale)
    .join(",");
}

export async function resolveProjectSpellcheckWords(input: {
  organizationId: string;
  projectId: string;
  locale: string;
}): Promise<ResolvedSpellcheckWords> {
  const attachments = await db
    .select({
      dictionaryId: schema.projectSpellcheckDictionaries.dictionaryId,
      wordsVersion: schema.spellcheckDictionaries.wordsVersion,
      priority: schema.projectSpellcheckDictionaries.priority,
      createdAt: schema.projectSpellcheckDictionaries.createdAt,
    })
    .from(schema.projectSpellcheckDictionaries)
    .innerJoin(
      schema.spellcheckDictionaries,
      eq(schema.spellcheckDictionaries.id, schema.projectSpellcheckDictionaries.dictionaryId),
    )
    .where(
      and(
        eq(schema.projectSpellcheckDictionaries.organizationId, input.organizationId),
        eq(schema.projectSpellcheckDictionaries.projectId, input.projectId),
        eq(schema.spellcheckDictionaries.status, "active"),
      ),
    )
    .orderBy(
      asc(schema.projectSpellcheckDictionaries.priority),
      asc(schema.projectSpellcheckDictionaries.createdAt),
      asc(schema.projectSpellcheckDictionaries.dictionaryId),
    );

  if (attachments.length === 0) {
    return { words: [], wordsVersion: input.locale, dictionaryIds: [] };
  }

  const dictionaryIds = attachments.map((attachment) => attachment.dictionaryId);
  const wordRows = await db
    .select({
      dictionaryId: schema.spellcheckDictionaryWords.dictionaryId,
      word: schema.spellcheckDictionaryWords.word,
      wordNormalized: schema.spellcheckDictionaryWords.wordNormalized,
    })
    .from(schema.spellcheckDictionaryWords)
    .where(
      and(
        inArray(schema.spellcheckDictionaryWords.dictionaryId, dictionaryIds),
        eq(schema.spellcheckDictionaryWords.locale, input.locale),
      ),
    );

  const priorityByDictionary = new Map(
    attachments.map((attachment) => [attachment.dictionaryId, attachment.priority]),
  );
  const createdAtByDictionary = new Map(
    attachments.map((attachment) => [attachment.dictionaryId, attachment.createdAt.getTime()]),
  );
  const versionByDictionary = new Map(
    attachments.map((attachment) => [attachment.dictionaryId, attachment.wordsVersion]),
  );

  const words = unionResolvedSpellcheckWords(
    wordRows.map((row) => ({
      dictionaryId: row.dictionaryId,
      wordsVersion: versionByDictionary.get(row.dictionaryId) ?? 1,
      priority: priorityByDictionary.get(row.dictionaryId) ?? 0,
      createdAtMs: createdAtByDictionary.get(row.dictionaryId) ?? 0,
      word: row.word,
      wordNormalized: row.wordNormalized,
    })),
  );

  return {
    words,
    wordsVersion: resolvedSpellcheckWordsVersion(attachments, input.locale),
    dictionaryIds,
  };
}
