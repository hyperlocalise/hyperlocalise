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
import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

import type { CompletionSource } from "./report-units";

type Provenance = (typeof schema.projectTranslationRevisions.$inferSelect)["provenance"];

/** Where a translation's text came from, from how the editor says it was written. */
export function sourceOfProvenance(provenance: Provenance): CompletionSource {
  switch (provenance) {
    case "manual":
      return "person";
    case "import":
      return "import";
    case "translation_job":
    case "agent":
      return "ai";
  }
}

export type TextOrigin = {
  /** Where the text a person was given came from. */
  source: CompletionSource;
  /** Whether the text now saved is that text, untouched. */
  unchanged: boolean;
};

/**
 * For each saved translation, what a person was given and whether they changed it: the latest
 * version not written by a person (a task's output, an import) against the text saved now. A
 * translation with no such version was written by a person from nothing.
 */
export async function textOrigins(
  organizationId: string,
  translations: { id: string; text: string }[],
): Promise<Map<string, TextOrigin>> {
  const origins = new Map<string, TextOrigin>();
  if (translations.length === 0) return origins;
  const given = await db
    .selectDistinctOn([schema.projectTranslationRevisions.translationId], {
      translationId: schema.projectTranslationRevisions.translationId,
      text: schema.projectTranslationRevisions.text,
      provenance: schema.projectTranslationRevisions.provenance,
    })
    .from(schema.projectTranslationRevisions)
    .where(
      and(
        eq(schema.projectTranslationRevisions.organizationId, organizationId),
        inArray(
          schema.projectTranslationRevisions.translationId,
          translations.map((translation) => translation.id),
        ),
        ne(schema.projectTranslationRevisions.actorKind, "user"),
      ),
    )
    .orderBy(
      schema.projectTranslationRevisions.translationId,
      sql`${schema.projectTranslationRevisions.createdAt} desc`,
    );
  const givenById = new Map(given.map((row) => [row.translationId, row]));
  for (const translation of translations) {
    const was = givenById.get(translation.id);
    origins.set(
      translation.id,
      was
        ? { source: sourceOfProvenance(was.provenance), unchanged: was.text === translation.text }
        : { source: "person", unchanged: false },
    );
  }
  return origins;
}

/** What a person's save records: the given text's source if they kept it, else their own work. */
export function personSave(origin: TextOrigin | undefined): {
  source: CompletionSource;
  unchanged: boolean;
} {
  if (!origin) return { source: "person", unchanged: false };
  return origin.unchanged ? origin : { source: "person", unchanged: false };
}
