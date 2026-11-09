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
import { type SQL, sql } from "drizzle-orm";

import type { schema } from "@/lib/database/client";

import type { TranslationOrigin, TranslationOriginWriter } from "./translation-origin-rule";

// The rule's values must stay the enum's values.
type SchemaOrigin = (typeof schema.projectTranslations.$inferSelect)["origin"];
const originsMatchSchema: [SchemaOrigin, TranslationOrigin] extends [
  TranslationOrigin,
  SchemaOrigin,
]
  ? true
  : never = true;
void originsMatchSchema;

/**
 * `nextTranslationOrigin` (see `translation-origin-rule.ts`) as SQL for a write that replaces the
 * current row's text with `text`, read against the row being written: an `UPDATE … SET`, or
 * `ON CONFLICT DO UPDATE` with `excluded.text` (see `translationOriginOnConflict`).
 */
export function translationOriginOnUpdate(writer: TranslationOriginWriter, text: SQL): SQL {
  if (writer === "machine") return sql`'machine'::project_translation_origin`;
  const changed = writer === "import" ? sql`'unknown'` : sql`'human'`;
  const overMachine = writer === "import" ? sql`'unknown'` : sql`'machine_post_edited'`;
  return sql`(case
    when "project_translations"."text" = ${text} then "project_translations"."origin"::text
    when "project_translations"."origin" in ('machine', 'machine_post_edited') then ${overMachine}
    else ${changed} end)::project_translation_origin`;
}

/** `translationOriginOnUpdate` for an upsert's `ON CONFLICT DO UPDATE SET`. */
export function translationOriginOnConflict(writer: TranslationOriginWriter): SQL {
  return translationOriginOnUpdate(writer, sql.raw(`excluded."text"`));
}
